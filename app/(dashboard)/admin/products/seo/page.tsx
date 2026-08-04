import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getOperatorContext } from '@/lib/auth/context'
import { ADMIN_LOGIN_PATH } from '@/lib/auth/login-paths'
import { Button } from '@/components/ui/button'
import { ProductSeoEditor } from '@/components/products/ProductSeoEditor'
import { listPublicProducts } from '@/lib/public-products'
import { ArrowLeft } from 'lucide-react'

export const metadata = {
  title: 'Product SEO',
}

export default async function ProductsSeoPage() {
  const ctx = await getOperatorContext()
  if (!ctx) redirect(ADMIN_LOGIN_PATH)
  if (!ctx.permissions.see_products) redirect('/invoices?view=due')

  const canEdit = ctx.isAdmin || ctx.permissions.products_edit

  // Use the public-products helper so the shape matches what the editor expects.
  const products = await listPublicProducts()

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 border-b border-border pb-5">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Product SEO</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Edit titles, descriptions and structured-data fields for every product.
          </p>
        </div>
        <Button variant="outline" asChild>
          <Link href="/admin/products">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to products
          </Link>
        </Button>
      </div>

      <ProductSeoEditor products={products} canEdit={canEdit} />
    </div>
  )
}
