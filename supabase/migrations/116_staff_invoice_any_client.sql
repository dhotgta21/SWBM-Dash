-- Allow staff who have been granted invoices_add to read any client so they
-- can create invoices against admin-owned clients, not just clients they
-- personally created. The createInvoice action still gates on invoices_add
-- and verifies the client exists, so this only widens SELECT visibility.

DROP POLICY IF EXISTS clients_select ON public.clients;
CREATE POLICY clients_select ON public.clients
  FOR SELECT TO authenticated USING (
    created_by = auth.uid()
    OR public.is_admin()
    OR public.has_staff_permission('invoices_add')
    OR EXISTS (
      SELECT 1 FROM public.profiles p
       WHERE p.id = auth.uid()
         AND p.role = 'client'
         AND p.client_id = clients.id
    )
  );
