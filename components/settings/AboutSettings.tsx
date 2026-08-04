'use client'

// Settings UI for the new About-page fields:
//   * founded year, fleet size, yard description, opening hours text
//   * team members list (add / edit / delete)
//   * history milestones list (add / edit / delete)
//   * yard sections list (add / edit / delete)
//
// Renders three collapsible panels. Each list editor manages a single
// row at a time (no inline table) to keep the UI scannable for a solo
// operator. Photo upload is intentionally out of scope for this pass —
// the operator pastes a Supabase Storage URL when they have one. A
// drag-and-drop uploader can be added later without a schema change.

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Save, Trash2, X } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { SettingsSection } from './SettingsSection'
import {
  upsertTeamMember,
  deleteTeamMember,
  upsertHistoryMilestone,
  deleteHistoryMilestone,
  updateAboutPageBasics,
  type TeamMemberRow,
  type HistoryMilestoneRow,
} from '@/lib/actions/about'

// =============================================================================
// About-page fields on company_settings
// =============================================================================

interface CompanyExtras {
  id?: number | null
  founded_year: number | null
  fleet_size: number | null
  yard_description: string | null
  opening_hours_text: string | null
}

export function AboutSettingsSection({ company }: { company: CompanyExtras | null }) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [loading, setLoading] = useState(false)
  const defaultOpeningHours = 'Mon–Fri 7:00am – 5:00pm · Sat 8:00am – 12:00pm'
  const [openingHoursText, setOpeningHoursText] = useState<string>(
    (company?.opening_hours_text ?? defaultOpeningHours).replace(/&middot;/g, '·'),
  )

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    setSuccess(false)
    try {
      const formData = new FormData(e.currentTarget)
      // Make sure the user-edited opening hours text (which we keep in
      // local state to preserve the dot character) is in the form.
      formData.set('opening_hours_text', openingHoursText)
      const result = await updateAboutPageBasics(formData)
      if (result?.error) {
        setError(result.error)
      } else if (result?.success) {
        setSuccess(true)
        router.refresh()
      } else {
        setError('Unexpected response from server. Please try again.')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save settings.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <SettingsSection
      title="About page"
      description="The founding year, fleet size, yard description and opening-hours text shown on /about, the home page stats and the JSON-LD opening-hours schema."
    >
      <form
        onSubmit={handleSubmit}
        className="space-y-6"
        key={JSON.stringify([
          company?.founded_year,
          company?.fleet_size,
          company?.yard_description,
          company?.opening_hours_text,
        ])}
      >
        <input type="hidden" name="id" value={company?.id ?? 1} readOnly />

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        {success && (
          <Alert>
            <AlertDescription>Settings saved.</AlertDescription>
          </Alert>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="founded_year">Founded year</Label>
            <Input
              id="founded_year"
              name="founded_year"
              type="number"
              min={1900}
              max={2100}
              defaultValue={company?.founded_year ?? 2017}
              placeholder="2017"
            />
            <p className="text-xs text-muted-foreground">
              Used for the &quot;Years on the counter&quot; stat and the JSON-LD foundingDate.
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="fleet_size">Fleet size (delivery lorries)</Label>
            <Input
              id="fleet_size"
              name="fleet_size"
              type="number"
              min={0}
              max={999}
              defaultValue={company?.fleet_size ?? ''}
              placeholder="2"
            />
            <p className="text-xs text-muted-foreground">
              Shown on the yard section. Leave empty to keep the default.
            </p>
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="yard_description">Yard description</Label>
          <Textarea
            id="yard_description"
            name="yard_description"
            rows={4}
            defaultValue={company?.yard_description ?? ''}
            placeholder="Two of our own lorries sit ready for same-day delivery across the region. One side of the yard stocks bricks and tiles, the other side structural steel and lintels..."
          />
          <p className="text-xs text-muted-foreground">
            1–3 sentences about the yard. Plain English; visitors want to picture the place.
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="opening_hours_text">Opening hours (human-readable)</Label>
          <Input
            id="opening_hours_text"
            name="opening_hours_text"
            value={openingHoursText}
            onChange={(e) => setOpeningHoursText(e.target.value)}
            placeholder="Mon–Fri 7:00am – 5:00pm · Sat 8:00am – 12:00pm"
          />
          <p className="text-xs text-muted-foreground">
            The single-line string shown in the footer, contact section and AI assistant. The
            structured day-by-day schedule is set below in &quot;Structured opening hours&quot;.
          </p>
        </div>

        <div className="flex justify-end">
          <Button type="submit" disabled={loading}>
            <Save className="mr-2 h-4 w-4" />
            {loading ? 'Saving…' : 'Save About settings'}
          </Button>
        </div>
      </form>
    </SettingsSection>
  )
}

// =============================================================================
// Team members
// =============================================================================

export function TeamSettingsSection({ initialMembers }: { initialMembers: TeamMemberRow[] }) {
  const router = useRouter()
  const [members, setMembers] = useState<TeamMemberRow[]>(initialMembers)
  const [editing, setEditing] = useState<TeamMemberRow | null>(null)
  const [isCreating, setIsCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const blankMember: TeamMemberRow = {
    id: '',
    name: '',
    role: '',
    bio: null,
    photo_url: null,
    sort_order: members.length,
    is_active: true,
  }

  function openCreate() {
    setEditing(blankMember)
    setIsCreating(true)
    setError(null)
  }

  function openEdit(member: TeamMemberRow) {
    setEditing(member)
    setIsCreating(false)
    setError(null)
  }

  function closeForm() {
    setEditing(null)
    setIsCreating(false)
    setError(null)
  }

  async function handleSubmit(formData: FormData) {
    setError(null)
    startTransition(async () => {
      const result = await upsertTeamMember(formData)
      if (result?.error) {
        setError(result.error)
        return
      }
      router.refresh()
      closeForm()
      // Optimistic re-fetch. The server already revalidated tags so the
      // page will refetch on the next render.
      try {
        const { listTeamMembersForAdmin } = await import('@/lib/actions/about')
        const fresh = await listTeamMembersForAdmin()
        setMembers(fresh)
      } catch {
        // Best-effort — the router.refresh above is the real source of truth.
      }
    })
  }

  function handleDelete(id: string) {
    if (typeof window !== 'undefined' && !window.confirm('Delete this team member?')) return
    startTransition(async () => {
      const result = await deleteTeamMember(id)
      if (result?.error) {
        setError(result.error)
        return
      }
      router.refresh()
      try {
        const { listTeamMembersForAdmin } = await import('@/lib/actions/about')
        const fresh = await listTeamMembersForAdmin()
        setMembers(fresh)
      } catch {
        // best-effort
      }
    })
  }

  return (
    <SettingsSection
      title="Team"
      description="Staff surfaced on the public /about page. One card per row. Drag-and-drop photo upload can be added later — for now, paste a Supabase Storage URL."
    >
      <div className="space-y-4">
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <ul className="divide-y divide-border rounded-2xl border border-border bg-card">
          {members.length === 0 && (
            <li className="p-6 text-sm text-muted-foreground">
              No team members yet. Add your first one — start with the founder.
            </li>
          )}
          {members.map((member) => (
            <li
              key={member.id}
              className="flex items-center justify-between gap-4 p-4 sm:p-5"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-foreground">{member.name}</p>
                <p className="truncate text-xs text-muted-foreground">{member.role}</p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Button size="sm" variant="outline" onClick={() => openEdit(member)} disabled={pending}>
                  Edit
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleDelete(member.id)}
                  disabled={pending}
                  className="text-destructive hover:bg-destructive/10"
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                </Button>
              </div>
            </li>
          ))}
        </ul>

        {!editing && (
          <Button onClick={openCreate} variant="outline">
            <Plus className="mr-2 h-4 w-4" />
            Add team member
          </Button>
        )}

        {editing && (
          <form
            action={handleSubmit}
            className="space-y-4 rounded-2xl border border-primary/30 bg-primary/5 p-5"
          >
            <input type="hidden" name="id" value={isCreating ? '' : editing.id} />
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-foreground">
                {isCreating ? 'New team member' : `Edit ${editing.name}`}
              </p>
              <button
                type="button"
                onClick={closeForm}
                className="text-muted-foreground hover:text-foreground"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="tm-name">Name</Label>
                <Input id="tm-name" name="name" required defaultValue={editing.name} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="tm-role">Role</Label>
                <Input id="tm-role" name="role" required defaultValue={editing.role} placeholder="Director / Yard Manager / Counter" />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="tm-bio">Bio</Label>
              <Textarea
                id="tm-bio"
                name="bio"
                rows={3}
                defaultValue={editing.bio ?? ''}
                placeholder="1–2 sentences. What they do, how long they've been at the yard."
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="tm-photo">Photo URL</Label>
                <Input
                  id="tm-photo"
                  name="photo_url"
                  defaultValue={editing.photo_url ?? ''}
                  placeholder="https://…/supabase.co/storage/v1/object/public/team-assets/…"
                />
                <p className="text-xs text-muted-foreground">
                  Upload images to the <code>team-assets</code> bucket and paste the URL.
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="tm-order">Sort order</Label>
                <Input
                  id="tm-order"
                  name="sort_order"
                  type="number"
                  defaultValue={editing.sort_order}
                />
              </div>
            </div>
            <label className="inline-flex items-center gap-2 text-sm text-foreground">
              <input
                type="checkbox"
                name="is_active"
                defaultChecked={editing.is_active}
                className="h-4 w-4 rounded border-border"
              />
              Show on /about
            </label>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={closeForm}>
                Cancel
              </Button>
              <Button type="submit" disabled={pending}>
                <Save className="mr-2 h-4 w-4" />
                {isCreating ? 'Add member' : 'Save changes'}
              </Button>
            </div>
          </form>
        )}
      </div>
    </SettingsSection>
  )
}

// =============================================================================
// History milestones
// =============================================================================

export function HistorySettingsSection({ initialMilestones }: { initialMilestones: HistoryMilestoneRow[] }) {
  const router = useRouter()
  const [milestones, setMilestones] = useState<HistoryMilestoneRow[]>(initialMilestones)
  const [editing, setEditing] = useState<HistoryMilestoneRow | null>(null)
  const [isCreating, setIsCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const blank: HistoryMilestoneRow = {
    id: '',
    year: new Date().getFullYear(),
    title: '',
    body: '',
    image_url: null,
    sort_order: milestones.length,
    is_active: true,
  }

  function openCreate() {
    setEditing(blank)
    setIsCreating(true)
    setError(null)
  }
  function openEdit(m: HistoryMilestoneRow) {
    setEditing(m)
    setIsCreating(false)
    setError(null)
  }
  function closeForm() {
    setEditing(null)
    setIsCreating(false)
    setError(null)
  }

  async function handleSubmit(formData: FormData) {
    setError(null)
    startTransition(async () => {
      const result = await upsertHistoryMilestone(formData)
      if (result?.error) {
        setError(result.error)
        return
      }
      router.refresh()
      closeForm()
      try {
        const { listHistoryMilestonesForAdmin } = await import('@/lib/actions/about')
        const fresh = await listHistoryMilestonesForAdmin()
        setMilestones(fresh)
      } catch {
        // best-effort
      }
    })
  }

  function handleDelete(id: string) {
    if (typeof window !== 'undefined' && !window.confirm('Delete this milestone?')) return
    startTransition(async () => {
      const result = await deleteHistoryMilestone(id)
      if (result?.error) {
        setError(result.error)
        return
      }
      router.refresh()
      try {
        const { listHistoryMilestonesForAdmin } = await import('@/lib/actions/about')
        const fresh = await listHistoryMilestonesForAdmin()
        setMilestones(fresh)
      } catch {
        // best-effort
      }
    })
  }

  return (
    <SettingsSection
      title="Company history"
      description="Chronological milestones rendered on the /about timeline. Ordered by sort_order then by year."
    >
      <div className="space-y-4">
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <ul className="divide-y divide-border rounded-2xl border border-border bg-card">
          {milestones.length === 0 && (
            <li className="p-6 text-sm text-muted-foreground">
              No milestones yet. Add the founding year, expansions, key moments.
            </li>
          )}
          {milestones.map((m) => (
            <li key={m.id} className="flex items-center justify-between gap-4 p-4 sm:p-5">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-foreground">
                  <span className="mr-2 text-primary">{m.year}</span>
                  {m.title}
                </p>
                <p className="line-clamp-2 text-xs text-muted-foreground">{m.body}</p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Button size="sm" variant="outline" onClick={() => openEdit(m)} disabled={pending}>
                  Edit
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleDelete(m.id)}
                  disabled={pending}
                  className="text-destructive hover:bg-destructive/10"
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                </Button>
              </div>
            </li>
          ))}
        </ul>

        {!editing && (
          <Button onClick={openCreate} variant="outline">
            <Plus className="mr-2 h-4 w-4" />
            Add milestone
          </Button>
        )}

        {editing && (
          <form
            action={handleSubmit}
            className="space-y-4 rounded-2xl border border-primary/30 bg-primary/5 p-5"
          >
            <input type="hidden" name="id" value={isCreating ? '' : editing.id} />
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-foreground">
                {isCreating ? 'New milestone' : `Edit ${editing.year} — ${editing.title}`}
              </p>
              <button
                type="button"
                onClick={closeForm}
                className="text-muted-foreground hover:text-foreground"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="hm-year">Year</Label>
                <Input
                  id="hm-year"
                  name="year"
                  type="number"
                  min={1900}
                  max={2100}
                  required
                  defaultValue={editing.year}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="hm-title">Title</Label>
                <Input id="hm-title" name="title" required defaultValue={editing.title} placeholder="Opened our second yard" />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="hm-body">Body</Label>
              <Textarea
                id="hm-body"
                name="body"
                rows={4}
                required
                defaultValue={editing.body}
                placeholder="1–3 sentences about what happened that year."
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="hm-image">Image URL</Label>
                <Input
                  id="hm-image"
                  name="image_url"
                  defaultValue={editing.image_url ?? ''}
                  placeholder="https://…/team-assets/…"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="hm-order">Sort order</Label>
                <Input id="hm-order" name="sort_order" type="number" defaultValue={editing.sort_order} />
              </div>
            </div>
            <label className="inline-flex items-center gap-2 text-sm text-foreground">
              <input
                type="checkbox"
                name="is_active"
                defaultChecked={editing.is_active}
                className="h-4 w-4 rounded border-border"
              />
              Show on /about
            </label>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={closeForm}>
                Cancel
              </Button>
              <Button type="submit" disabled={pending}>
                <Save className="mr-2 h-4 w-4" />
                {isCreating ? 'Add milestone' : 'Save changes'}
              </Button>
            </div>
          </form>
        )}
      </div>
    </SettingsSection>
  )
}

// =============================================================================
// Yard sections (visual chips on /about)
// =============================================================================

// Allowed icon names — keep in sync with components/about/YardSection.tsx.
const ALLOWED_YARD_ICONS = [
  'ToyBrick',
  'Trees',
  'Construction',
  'Layers',
  'PanelsTopLeft',
  'Snowflake',
  'ShieldHalf',
  'Droplets',
  'Box',
  'Pipette',
  'Pin',
  'Wrench',
  'Home',
] as const

export type YardIconName = (typeof ALLOWED_YARD_ICONS)[number]

interface YardSectionRow {
  name: string
  icon: string
  blurb: string
}

export function YardSectionsSettingsSection({
  initialSections,
}: {
  initialSections: YardSectionRow[]
}) {
  const [sections, setSections] = useState<YardSectionRow[]>(initialSections)
  const [draft, setDraft] = useState<YardSectionRow>({ name: '', icon: 'ToyBrick', blurb: '' })
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  function add() {
    setError(null)
    if (!draft.name.trim()) {
      setError('Section name is required.')
      return
    }
    setSections((prev) => [...prev, { name: draft.name.trim(), icon: draft.icon, blurb: draft.blurb.trim() }])
    setDraft({ name: '', icon: 'ToyBrick', blurb: '' })
  }

  function remove(idx: number) {
    setSections((prev) => prev.filter((_, i) => i !== idx))
  }

  function move(idx: number, delta: number) {
    setSections((prev) => {
      const next = [...prev]
      const target = idx + delta
      if (target < 0 || target >= next.length) return prev
      ;[next[idx], next[target]] = [next[target], next[idx]]
      return next
    })
  }

  async function persist() {
    setPending(true)
    setError(null)
    setSuccess(false)
    try {
      // POST the array as a hidden JSON field via the existing settings
      // action by piggy-backing on the form. We can't easily add a
      // dedicated action without breaking the existing flow, so we send
      // the JSON via a dedicated server-action wrapper below.
      const formData = new FormData()
      formData.set('yard_sections', JSON.stringify(sections))
      const result = await persistYardSections(formData)
      if (result?.error) {
        setError(result.error)
      } else {
        setSuccess(true)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save yard sections.')
    } finally {
      setPending(false)
    }
  }

  return (
    <SettingsSection
      title="Yard sections"
      description="The visual chips on the /about yard section. Order matters — top to bottom."
    >
      <div className="space-y-4">
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        {success && (
          <Alert>
            <AlertDescription>Yard sections saved.</AlertDescription>
          </Alert>
        )}

        <ul className="divide-y divide-border rounded-2xl border border-border bg-card">
          {sections.length === 0 && (
            <li className="p-6 text-sm text-muted-foreground">
              No yard sections yet. Add a few — e.g. Bricks & tiles, Steel & lintels, Sheet materials.
            </li>
          )}
          {sections.map((s, idx) => (
            <li key={`${s.name}-${idx}`} className="flex items-center gap-3 p-4 sm:p-5">
              <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-xs font-bold uppercase text-primary">
                {s.icon.slice(0, 2)}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-foreground">{s.name}</p>
                <p className="truncate text-xs text-muted-foreground">{s.blurb || '—'}</p>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <Button size="sm" variant="ghost" onClick={() => move(idx, -1)} disabled={idx === 0 || pending}>
                  ↑
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => move(idx, 1)}
                  disabled={idx === sections.length - 1 || pending}
                >
                  ↓
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => remove(idx)}
                  disabled={pending}
                  className="text-destructive hover:bg-destructive/10"
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                </Button>
              </div>
            </li>
          ))}
        </ul>

        <div className="grid gap-3 rounded-2xl border border-dashed border-border bg-muted/30 p-4 sm:grid-cols-[1fr_180px_auto] sm:items-end">
          <div className="space-y-2">
            <Label htmlFor="ys-name">Section name</Label>
            <Input
              id="ys-name"
              value={draft.name}
              onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
              placeholder="Bricks, blocks & tiles"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="ys-icon">Icon</Label>
            <select
              id="ys-icon"
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={draft.icon}
              onChange={(e) => setDraft((d) => ({ ...d, icon: e.target.value }))}
            >
              {ALLOWED_YARD_ICONS.map((icon) => (
                <option key={icon} value={icon}>
                  {icon}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2 sm:col-span-3">
            <Label htmlFor="ys-blurb">One-line description</Label>
            <div className="flex gap-2">
              <Input
                id="ys-blurb"
                value={draft.blurb}
                onChange={(e) => setDraft((d) => ({ ...d, blurb: e.target.value }))}
                placeholder="Wirecut facing and engineering bricks down one wall of the yard."
                className="flex-1"
              />
              <Button type="button" onClick={add} variant="outline" disabled={pending}>
                <Plus className="mr-1 h-4 w-4" /> Add
              </Button>
            </div>
          </div>
        </div>

        <div className="flex justify-end">
          <Button onClick={persist} disabled={pending}>
            <Save className="mr-2 h-4 w-4" />
            {pending ? 'Saving…' : 'Save yard sections'}
          </Button>
        </div>
      </div>
    </SettingsSection>
  )
}

// Dedicated action: persists the yard_sections JSONB array.
async function persistYardSections(formData: FormData) {
  const { persistYardSectionsAction } = await import('@/lib/actions/yard')
  return persistYardSectionsAction(formData)
}