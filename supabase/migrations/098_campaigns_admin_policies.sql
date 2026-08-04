-- Campaign admin write policies.
-- Migration 096 created the campaigns tables and public/anonymous SELECT
-- policies so the shop can resolve group discounts. This migration adds the
-- INSERT/UPDATE/DELETE policies that let admins manage campaigns through the
-- dashboard server actions.

DROP POLICY IF EXISTS campaigns_admin_insert ON public.campaigns;
CREATE POLICY campaigns_admin_insert
  ON public.campaigns
  FOR INSERT TO authenticated
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS campaigns_admin_update ON public.campaigns;
CREATE POLICY campaigns_admin_update
  ON public.campaigns
  FOR UPDATE TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS campaigns_admin_delete ON public.campaigns;
CREATE POLICY campaigns_admin_delete
  ON public.campaigns
  FOR DELETE TO authenticated
  USING (public.is_admin());

DROP POLICY IF EXISTS campaign_products_admin_insert ON public.campaign_products;
CREATE POLICY campaign_products_admin_insert
  ON public.campaign_products
  FOR INSERT TO authenticated
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS campaign_products_admin_update ON public.campaign_products;
CREATE POLICY campaign_products_admin_update
  ON public.campaign_products
  FOR UPDATE TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS campaign_products_admin_delete ON public.campaign_products;
CREATE POLICY campaign_products_admin_delete
  ON public.campaign_products
  FOR DELETE TO authenticated
  USING (public.is_admin());
