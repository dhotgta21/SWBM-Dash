-- =============================================================================
-- Star Hawk Builders Merchant — 063_about_team_history_yard.sql
-- =============================================================================
-- Adds the data backing for three new About-page sections:
--   * Team — staff photos, names, roles, bios surfaced on /about
--   * History — chronological milestones of the business
--   * Yard — opening hours, fleet size and yard-sections cards
--
-- Plus a small JSONB `opening_hours` column so the LocalBusiness schema
-- on the public site renders accurate opening hours pulled from Settings
-- instead of being hard-coded in two JSON-LD emitters.
-- =============================================================================

-- =============================================================================
-- 1. company_settings additions
-- =============================================================================
ALTER TABLE public.company_settings
  ADD COLUMN IF NOT EXISTS founded_year int,
  ADD COLUMN IF NOT EXISTS fleet_size int,
  ADD COLUMN IF NOT EXISTS yard_description text,
  ADD COLUMN IF NOT EXISTS yard_sections jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS opening_hours_text text,
  ADD COLUMN IF NOT EXISTS opening_hours jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.company_settings.founded_year IS
  'Year the business was founded. Used by About page + JSON-LD. Falls back to 2017 if null.';
COMMENT ON COLUMN public.company_settings.fleet_size IS
  'Number of delivery lorries in the fleet. Used by About/yard sections.';
COMMENT ON COLUMN public.company_settings.yard_description IS
  'Free-text description of the yard for the About page (1-3 sentences).';
COMMENT ON COLUMN public.company_settings.yard_sections IS
  'JSONB array of yard sections: [{name, icon, blurb}]. Icons reference Lucide names (Bricks, Wood, Construction, etc.).';
COMMENT ON COLUMN public.company_settings.opening_hours_text IS
  'Human-readable opening hours string (e.g. "Mon–Fri 7am–5pm · Sat 8am–12pm"). Falls back to a default if null.';
COMMENT ON COLUMN public.company_settings.opening_hours IS
  'JSONB array of opening hours for JSON-LD OpeningHoursSpecification. Shape: [{day:"monday", open:"07:00", close:"17:00", closed:false}, ...]';

-- =============================================================================
-- 2. team_members
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.team_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  role text NOT NULL,
  bio text,
  photo_url text,
  sort_order int NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id) ON UPDATE CASCADE ON DELETE SET NULL
);

COMMENT ON TABLE public.team_members IS
  'Staff surfaced on the public /about page. Managed from Settings > Team.';

CREATE INDEX IF NOT EXISTS idx_team_members_active_sort
  ON public.team_members(is_active, sort_order);

-- updated_at trigger
DROP TRIGGER IF EXISTS trg_team_members_updated_at ON public.team_members;
CREATE TRIGGER trg_team_members_updated_at
  BEFORE UPDATE ON public.team_members
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- =============================================================================
-- 3. history_milestones
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.history_milestones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  year int NOT NULL,
  title text NOT NULL,
  body text NOT NULL,
  image_url text,
  sort_order int NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id) ON UPDATE CASCADE ON DELETE SET NULL
);

COMMENT ON TABLE public.history_milestones IS
  'Chronological business milestones surfaced on the /about page timeline.';

CREATE INDEX IF NOT EXISTS idx_history_milestones_active_sort
  ON public.history_milestones(is_active, sort_order);

DROP TRIGGER IF EXISTS trg_history_milestones_updated_at ON public.history_milestones;
CREATE TRIGGER trg_history_milestones_updated_at
  BEFORE UPDATE ON public.history_milestones
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- =============================================================================
-- 4. Storage bucket for team photos and milestone images
-- =============================================================================
INSERT INTO storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
VALUES (
  'team-assets',
  'team-assets',
  true,
  5242880, -- 5 MB
  ARRAY[
    'image/png',
    'image/jpeg',
    'image/gif',
    'image/webp',
    'image/svg+xml'
  ]
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "Public read access on team-assets" ON storage.objects;
CREATE POLICY "Public read access on team-assets"
ON storage.objects
FOR SELECT
TO public
USING (bucket_id = 'team-assets');

DROP POLICY IF EXISTS "Admin insert on team-assets" ON storage.objects;
CREATE POLICY "Admin insert on team-assets"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'team-assets'
  AND EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin'
  )
);

DROP POLICY IF EXISTS "Admin update on team-assets" ON storage.objects;
CREATE POLICY "Admin update on team-assets"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'team-assets'
  AND EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin'
  )
)
WITH CHECK (bucket_id = 'team-assets');

DROP POLICY IF EXISTS "Admin delete on team-assets" ON storage.objects;
CREATE POLICY "Admin delete on team-assets"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'team-assets'
  AND EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin'
  )
);

-- =============================================================================
-- 5. Row Level Security on team_members and history_milestones
-- =============================================================================
ALTER TABLE public.team_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.history_milestones ENABLE ROW LEVEL SECURITY;

-- Service role: full access (used by server actions)
GRANT SELECT, INSERT, UPDATE, DELETE ON public.team_members TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.history_milestones TO service_role;

-- Public read: any visitor can see active rows (used by /about)
DROP POLICY IF EXISTS team_members_public_select ON public.team_members;
CREATE POLICY team_members_public_select ON public.team_members
  FOR SELECT TO anon, authenticated
  USING (is_active = true);

DROP POLICY IF EXISTS history_milestones_public_select ON public.history_milestones;
CREATE POLICY history_milestones_public_select ON public.history_milestones
  FOR SELECT TO anon, authenticated
  USING (is_active = true);

-- Admin write: full CRUD for authenticated admins
DROP POLICY IF EXISTS team_members_admin_all ON public.team_members;
CREATE POLICY team_members_admin_all ON public.team_members
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

DROP POLICY IF EXISTS history_milestones_admin_all ON public.history_milestones;
CREATE POLICY history_milestones_admin_all ON public.history_milestones
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );