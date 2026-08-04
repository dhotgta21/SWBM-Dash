// components/shop/QuoteShell.tsx
// /quote page shell. Owns the tab state and the in-page "drill into a
// category" state so visitors can build a quote list without ever
// leaving /quote.
//
// Three pieces of local state:
//   * tab — 'search' (the QuoteBuilder search panel) or 'catalogue'
//     (browse the photo-tile category grid).
//   * openCategory — when set, the catalogue panel swaps the grid for
//     that category's product list. A "Back to categories" button is
//     rendered in the right rail (passed down via `backAction` to
//     QuoteSidebar). The persistent cart rail stays visible the whole
//     time, so customers never lose track of what they have already added.
//   * selectedProduct — when set, the catalogue panel shows an inline
//     product detail panel instead of the product list. The customer can
//     go back to the product list, or use the sidebar button to jump
//     straight back to the category grid.
//
// The active view is also synchronised to the URL query string
// (`?tab=catalogue&category=...&product=...`) so the browser back and
// forward buttons restore the previous view instead of dropping the
// visitor on an unexpected default page.
//
// Why not navigate to /quote/[slug] or /products/[code]? Those
// separate pages are kept for SEO and direct sharing, but in-app
// drilling stays in-page so the flow is uninterrupted.

'use client'

import { useEffect, useMemo, useState } from 'react'
import { ChevronRight, Search, BookOpen } from 'lucide-react'
import { QuoteBuilder } from './QuoteBuilder'
import { QuoteSidebar } from './QuoteSidebar'
import { CategoryGrid, type CategoryRow } from '@/components/landing/CategoryGrid'
import { PublicProductCard } from './PublicProductCard'
import { InlineProductDetail } from './InlineProductDetail'
import type { PublicProduct } from '@/lib/public-products'

type Tab = 'search' | 'catalogue'

const TAB_LABELS: Record<Tab, { label: string; sub: string }> = {
  search: {
    label: 'Search products',
    sub: 'Type a name or code.',
  },
  catalogue: {
    label: 'Browse catalogue',
    sub: 'Pick a line, add it to your quote.',
  },
}

interface QuoteShellProps {
  categories: CategoryRow[]
  /** All active products, so we can drill in without another fetch. */
  products: PublicProduct[]
}

/** Header on the right rail that returns to the catalogue grid. */
export interface BackAction {
  label: string
  onClick: () => void
}

export function QuoteShell({ categories, products }: QuoteShellProps) {
  const [tab, setTab] = useState<Tab>('search')
  const [openCategoryName, setOpenCategoryName] = useState<string | null>(null)
  const [selectedProduct, setSelectedProduct] = useState<PublicProduct | null>(null)
  const [mounted, setMounted] = useState(false)

  // Memoised product lookup so the inline category view filters
  // cheaply even on re-renders triggered by the cart updating.
  const productsByCategory = useMemo(() => {
    const map = new Map<string, PublicProduct[]>()
    for (const product of products) {
      if (!product.category) continue
      const list = map.get(product.category) ?? []
      list.push(product)
      map.set(product.category, list)
    }
    return map
  }, [products])

  const productsByCode = useMemo(() => {
    const map = new Map<string, PublicProduct>()
    for (const product of products) {
      map.set(product.code, product)
    }
    return map
  }, [products])

  // Restore the in-page view from the URL on mount so direct links and
  // refreshed pages land in the right state.
  useEffect(() => {
    applyUrlState(new URLSearchParams(window.location.search))
    setMounted(true)
  }, [categories, productsByCode])

  // Keep the in-page view in sync when the user presses the browser back
  // or forward buttons.
  useEffect(() => {
    function handlePopState() {
      applyUrlState(new URLSearchParams(window.location.search))
    }
    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [categories, productsByCode])

  function applyUrlState(params: URLSearchParams) {
    const urlTab = params.get('tab')
    const urlCategory = params.get('category')
    const urlProductCode = params.get('product')

    setTab(urlTab === 'catalogue' ? 'catalogue' : 'search')

    let nextCategory: string | null = null
    if (urlCategory && categories.some((c) => c.name === urlCategory)) {
      nextCategory = urlCategory
    }

    let nextProduct: PublicProduct | null = null
    if (urlProductCode) {
      const product = productsByCode.get(urlProductCode)
      if (product) {
        nextProduct = product
        if (product.category) nextCategory = product.category
      }
    }

    setOpenCategoryName(nextCategory)
    setSelectedProduct(nextProduct)
  }

  function buildQuoteUrl(
    nextTab: Tab,
    nextCategory: string | null,
    nextProduct: PublicProduct | null,
  ): string {
    const params = new URLSearchParams(window.location.search)

    if (nextTab === 'catalogue') {
      params.set('tab', 'catalogue')
    } else {
      params.delete('tab')
      params.delete('category')
      params.delete('product')
    }

    if (nextCategory && nextTab === 'catalogue') {
      params.set('category', nextCategory)
    } else {
      params.delete('category')
    }

    if (nextProduct && nextTab === 'catalogue') {
      params.set('product', nextProduct.code)
    } else {
      params.delete('product')
    }

    const query = params.toString()
    return query ? `/quote?${query}` : '/quote'
  }

  function updateUrl(
    nextTab: Tab,
    nextCategory: string | null,
    nextProduct: PublicProduct | null,
    mode: 'push' | 'replace',
  ) {
    if (!mounted) return
    const url = buildQuoteUrl(nextTab, nextCategory, nextProduct)
    if (mode === 'push') {
      window.history.pushState(null, '', url)
    } else {
      window.history.replaceState(null, '', url)
    }
  }

  function scrollToCataloguePanel() {
    if (typeof window === 'undefined') return
    requestAnimationFrame(() => {
      const target = document.getElementById('catalogue-panel')
      if (target) {
        target.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }
    })
  }

  function handleTabChange(value: Tab) {
    setTab(value)
    if (value === 'search') {
      updateUrl('search', null, null, 'replace')
    } else {
      updateUrl('catalogue', openCategoryName, selectedProduct, 'replace')
    }
  }

  function openCategory(name: string) {
    setOpenCategoryName(name)
    setSelectedProduct(null)
    updateUrl('catalogue', name, null, 'push')
    scrollToCataloguePanel()
  }

  function closeCategory() {
    setOpenCategoryName(null)
    setSelectedProduct(null)
    updateUrl('catalogue', null, null, 'push')
  }

  function openProduct(product: PublicProduct) {
    setSelectedProduct(product)
    const category = product.category || openCategoryName
    updateUrl('catalogue', category, product, 'push')
    scrollToCataloguePanel()
  }

  function closeProduct() {
    setSelectedProduct(null)
    updateUrl('catalogue', openCategoryName, null, 'push')
    scrollToCataloguePanel()
  }

  // Context-aware back button for the right rail.
  //   Product detail  → "Back to {Category}"     → close product, return to category list
  //   Category list   → "Back to all categories" → close category, return to category grid
  //   Category grid   → no back button (top of the catalogue)
  const backAction: BackAction | null = selectedProduct
    ? {
        label: `Back to ${selectedProduct.category || openCategoryName || 'categories'}`,
        onClick: closeProduct,
      }
    : openCategoryName
      ? { label: 'Back to all categories', onClick: closeCategory }
      : null

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_360px]">
      <section aria-label="Quote builder">
        <div
          role="tablist"
          aria-label="How would you like to build your quote?"
          className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
        >
          <div className="inline-flex w-fit rounded-full border border-border bg-card p-1 shadow-sm">
            {(['search', 'catalogue'] as Tab[]).map((value) => {
              const Icon = value === 'search' ? Search : BookOpen
              const active = tab === value
              return (
                <button
                  key={value}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  aria-controls={`tab-panel-${value}`}
                  onClick={() => handleTabChange(value)}
                  className={[
                    'inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition-colors',
                    active
                      ? 'bg-foreground text-background shadow-sm'
                      : 'text-muted-foreground hover:text-foreground',
                  ].join(' ')}
                >
                  <Icon className="h-4 w-4" />
                  {TAB_LABELS[value].label}
                </button>
              )
            })}
          </div>
          <span className="text-xs font-medium text-muted-foreground">
            {TAB_LABELS[tab].sub}
          </span>
        </div>

        <div className="mt-6" id={`tab-panel-${tab}`} role="tabpanel">
          {tab === 'search' ? (
            <QuoteBuilder />
          ) : (
            <CataloguePanel
              categories={categories}
              productsByCategory={productsByCategory}
              openCategoryName={openCategoryName}
              onOpenCategory={openCategory}
              onCloseCategory={closeCategory}
              selectedProduct={selectedProduct}
              onOpenProduct={openProduct}
            />
          )}
        </div>
      </section>

      <QuoteSidebar backAction={backAction} />
    </div>
  )
}

interface CataloguePanelProps {
  categories: CategoryRow[]
  productsByCategory: Map<string, PublicProduct[]>
  openCategoryName: string | null
  onOpenCategory: (name: string) => void
  onCloseCategory: () => void
  selectedProduct: PublicProduct | null
  onOpenProduct: (product: PublicProduct) => void
}

function CataloguePanel({
  categories,
  productsByCategory,
  openCategoryName,
  onOpenCategory,
  onCloseCategory,
  selectedProduct,
  onOpenProduct,
}: CataloguePanelProps) {
  if (!openCategoryName) {
    return (
      <div id="catalogue-panel">
        <div className="mb-4 flex items-end justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-foreground">Browse the catalogue</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Click a line to see every product inside it, then add the sizes you need.
            </p>
          </div>
        </div>
        <CategoryGrid rows={categories} onSelect={onOpenCategory} />
      </div>
    )
  }

  if (selectedProduct) {
    return (
      <div id="catalogue-panel" key={selectedProduct.id}>
        <InlineProductDetail product={selectedProduct} />
      </div>
    )
  }

  return (
    <CategoryProductList
      key={openCategoryName /* reset scroll/state when switching */}
      categoryName={openCategoryName}
      products={productsByCategory.get(openCategoryName) ?? []}
      onBack={onCloseCategory}
      onOpenProduct={onOpenProduct}
    />
  )
}

interface CategoryProductListProps {
  categoryName: string
  products: PublicProduct[]
  onBack: () => void
  onOpenProduct: (product: PublicProduct) => void
}

function CategoryProductList({
  categoryName,
  products,
  onBack,
  onOpenProduct,
}: CategoryProductListProps) {
  return (
    <div id="catalogue-panel">
      <header className="mb-6">
        <span className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">
          {products.length} {products.length === 1 ? 'stock line' : 'stock lines'}
        </span>
        <h2 className="mt-2 text-2xl font-extrabold tracking-tight text-foreground sm:text-3xl">
          {`${categoryName} for trade & DIY.`}
        </h2>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
          Pick the lines you need and add them straight to your quote. You can
          come back here any time to grab more from this category.
        </p>
      </header>

      {products.length > 0 ? (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {products.map((product) => (
            <PublicProductCard
              key={product.id}
              product={product}
              onSelect={onOpenProduct}
            />
          ))}
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-border bg-card p-10 text-center">
          <p className="text-sm text-muted-foreground">
            We&rsquo;re refreshing the {categoryName.toLowerCase()} range. Send
            us your take-off and we&rsquo;ll quote it the same day.
          </p>
        </div>
      )}

      <div className="mt-8 flex items-center gap-2 text-sm text-muted-foreground">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-1 font-semibold text-primary hover:text-primary-hover"
        >
          <ChevronRight className="h-4 w-4 rotate-180" />
          Back to all categories
        </button>
      </div>
    </div>
  )
}
