import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { ProductForm } from '@/components/products/ProductForm'
import { ADMIN_LOGIN_PATH } from '@/lib/auth/login-paths'
import { resolveStaffPermissions } from '@/lib/auth/permissions'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export const metadata = {
  title: 'Add Product',
}

export default async function NewProductPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect(ADMIN_LOGIN_PATH)
  }

  const { data: profile } = await supabase.from('profiles').select('role, permissions').eq('id', user.id).maybeSingle()
  const perms = resolveStaffPermissions(profile?.role, profile?.permissions)
  if (!perms.products_add) {
    redirect('/admin/products')
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Add Product</h1>
        <p className="text-sm text-muted-foreground">Create a new product in the catalog</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Product Details</CardTitle>
        </CardHeader>
        <CardContent>
          <ProductForm redirectOnSuccess />
        </CardContent>
      </Card>
    </div>
  )
}
