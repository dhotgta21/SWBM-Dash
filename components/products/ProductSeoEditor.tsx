'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Search, Check, AlertCircle } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { updateProductSeo, type ProductSeoData } from '@/lib/actions/products'
import type { PublicProduct } from '@/lib/public-products'
import { productMatchesSearch } from '@/lib/search'

interface ProductSeoEditorProps {
  products: PublicProduct[]
  canEdit: boolean
}

function commaListToArray(value: string): string[] {
  return value
    .split(/\n|,/)
    .map((v) => v.trim())
    .filter(Boolean)
}

function arrayToCommaList(values: string[]): string {
  return values.join(', ')
}

export function ProductSeoEditor({ products, canEdit }: ProductSeoEditorProps) {
  const router = useRouter()
  const [query, setQuery] = useState('')
  const [savingId, setSavingId] = useState<string | null>(null)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [isPending, startTransition] = useTransition()

  const filtered = products.filter(
    (p) =>
      productMatchesSearch(p, query) ||
      (p.category?.toLowerCase() ?? '').includes(query.toLowerCase()),
  )

  async function handleSave(product: PublicProduct, formData: FormData) {
    if (!canEdit) return
    setSavingId(product.id)
    setMessage(null)

    const priceFromRaw = formData.get('price_from') as string
    const priceFrom = priceFromRaw ? Number(priceFromRaw) : null

    const data: ProductSeoData = {
      seo_title: formData.get('seo_title') as string,
      seo_description: formData.get('seo_description') as string,
      short_description: formData.get('short_description') as string,
      brand: formData.get('brand') as string,
      mpn: formData.get('mpn') as string,
      price_from: priceFrom != null && Number.isFinite(priceFrom) && priceFrom > 0 ? priceFrom : null,
      key_features: commaListToArray(formData.get('key_features') as string),
      applications: commaListToArray(formData.get('applications') as string),
    }

    const result = await updateProductSeo(product.id, data)
    setSavingId(null)
    if (result.error) {
      setMessage({ type: 'error', text: result.error })
    } else {
      setMessage({ type: 'success', text: `${product.name} SEO saved.` })
      startTransition(() => router.refresh())
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Search products</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Filter by name, code or category..."
              className="pl-9"
            />
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Showing {filtered.length} of {products.length} products.
          </p>
        </CardContent>
      </Card>

      {message && (
        <Alert variant={message.type === 'error' ? 'destructive' : 'default'}>
          <AlertDescription className="flex items-center gap-2">
            {message.type === 'error' ? <AlertCircle className="h-4 w-4" /> : <Check className="h-4 w-4" />}
            {message.text}
          </AlertDescription>
        </Alert>
      )}

      <div className="grid gap-4">
        {filtered.map((product) => (
          <Card key={product.id}>
            <CardContent className="p-5">
              <form
                action={(formData) => handleSave(product, formData)}
                className="space-y-4"
              >
                <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      {product.code} · {product.category ?? 'No category'}
                    </p>
                    <h3 className="text-base font-semibold text-foreground">{product.name}</h3>
                  </div>
                  <Button type="submit" size="sm" disabled={!canEdit || savingId === product.id || isPending}>
                    {savingId === product.id ? 'Saving…' : 'Save SEO'}
                  </Button>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2 sm:col-span-2">
                    <Label htmlFor={`seo_title_${product.id}`}>Title</Label>
                    <Input
                      id={`seo_title_${product.id}`}
                      name="seo_title"
                      defaultValue={product.seoTitle ?? ''}
                      placeholder="Product | Trade Prices & Same-Day Delivery | Demo Builder Merchant"
                      disabled={!canEdit}
                    />
                  </div>
                  <div className="space-y-2 sm:col-span-2">
                    <Label htmlFor={`seo_description_${product.id}`}>Meta description</Label>
                    <Input
                      id={`seo_description_${product.id}`}
                      name="seo_description"
                      defaultValue={product.seoDescription ?? ''}
                      placeholder="Short description for Google results."
                      disabled={!canEdit}
                    />
                  </div>
                  <div className="space-y-2 sm:col-span-2">
                    <Label htmlFor={`short_description_${product.id}`}>Short description</Label>
                    <Textarea
                      id={`short_description_${product.id}`}
                      name="short_description"
                      defaultValue={product.shortDescription ?? ''}
                      placeholder="One-sentence snippet used in product cards and social shares."
                      rows={2}
                      disabled={!canEdit}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor={`brand_${product.id}`}>Brand</Label>
                    <Input
                      id={`brand_${product.id}`}
                      name="brand"
                      defaultValue={product.brand ?? ''}
                      placeholder="e.g. LBC"
                      disabled={!canEdit}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor={`mpn_${product.id}`}>MPN</Label>
                    <Input
                      id={`mpn_${product.id}`}
                      name="mpn"
                      defaultValue={product.mpn ?? ''}
                      placeholder="Manufacturer part number"
                      disabled={!canEdit}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor={`price_from_${product.id}`}>Price from (£)</Label>
                    <Input
                      id={`price_from_${product.id}`}
                      name="price_from"
                      type="number"
                      step="0.01"
                      min="0"
                      defaultValue={product.priceFrom ?? ''}
                      placeholder="e.g. 24.50"
                      disabled={!canEdit}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor={`key_features_${product.id}`}>Key features</Label>
                    <Textarea
                      id={`key_features_${product.id}`}
                      name="key_features"
                      defaultValue={arrayToCommaList(product.keyFeatures)}
                      placeholder="Comma or newline separated"
                      rows={3}
                      disabled={!canEdit}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor={`applications_${product.id}`}>Typical uses</Label>
                    <Textarea
                      id={`applications_${product.id}`}
                      name="applications"
                      defaultValue={arrayToCommaList(product.applications)}
                      placeholder="Comma or newline separated"
                      rows={3}
                      disabled={!canEdit}
                    />
                  </div>
                </div>
              </form>
            </CardContent>
          </Card>
        ))}
      </div>

      {filtered.length === 0 && (
        <p className="text-center text-sm text-muted-foreground">No products match your search.</p>
      )}
    </div>
  )
}
