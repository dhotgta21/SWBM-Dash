import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { ProductForm } from '@/components/products/ProductForm'
import { getActiveCampaignForProduct } from '@/lib/actions/campaigns'
import { ADMIN_LOGIN_PATH } from '@/lib/auth/login-paths'
import { resolveStaffPermissions } from '@/lib/auth/permissions'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import Link from 'next/link'
import { ChevronLeft, Package } from 'lucide-react'

export const metadata = {
  title: 'Edit Product',
}

interface EditProductPageProps {
  params: Promise<{ id: string }>
}

/**
 * Dedicated edit page for an existing product — both permanent rows from the
 * main catalog *and* temporary rows promoted from the "Temporary products"
 * dashboard section. The form reuses ProductForm's initialData path; the
 * auto-promote logic inside updateProductRecord flips is_temporary=false
 * once the row is complete enough (real code, description, price > 0).
 */
export default async function EditProductPage({ params }: EditProductPageProps) {
  const { id } = await params

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect(ADMIN_LOGIN_PATH)
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, permissions')
    .eq('id', user.id)
    .maybeSingle()
  const perms = resolveStaffPermissions(profile?.role, profile?.permissions)
  if (!perms.products_edit) {
    redirect('/admin/products')
  }

  const { data: product, error } = await supabase
    .from('products')
    .select('*')
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle()

  if (error || !product) {
    notFound()
  }

  const activeCampaign = await getActiveCampaignForProduct(id)
  const isInCampaign = activeCampaign != null

  return (
    <div className="space-y-6">
      <div>
        <Link href="/admin/products" className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground">
          <ChevronLeft className="h-4 w-4 mr-1" />
          Back to products
        </Link>
        <div className="mt-2 flex items-center gap-2">
          <Package className="h-5 w-5 text-primary" />
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            {product.name}
          </h1>
          {product.is_temporary ? (
            <span className="inline-flex items-center rounded-full bg-amber-100 text-amber-900 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider">
              Temporary
            </span>
          ) : null}
        </div>
        <p className="text-sm text-muted-foreground mt-1">
          {product.is_temporary
            ? 'Promote this product to a permanent catalog entry by completing the missing fields, then save.'
            : 'Update the product details and save.'}
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Product Details</CardTitle>
        </CardHeader>
        <CardContent>
          <ProductForm redirectOnSuccess initialData={product} isInCampaign={isInCampaign} />
        </CardContent>
      </Card>
    </div>
  )
}
