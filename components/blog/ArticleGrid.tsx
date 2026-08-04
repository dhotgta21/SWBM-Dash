// components/blog/ArticleGrid.tsx
// Interactive advice-article grid with search and category filtering.

'use client'

import * as React from 'react'
import { Search, SlidersHorizontal, X, Tag, ArrowUpDown } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ArticleCard } from '@/components/blog/ArticleCard'
import type { BlogArticle } from '@/lib/articles/loader'

type SortOption = 'newest' | 'oldest' | 'title-asc' | 'title-desc'

interface ArticleGridProps {
  readonly posts: readonly BlogArticle[]
}

interface FilterState {
  query: string
  category: string
  sort: SortOption
}

export function ArticleGrid({ posts }: ArticleGridProps) {
  const [filters, setFilters] = React.useState<FilterState>({
    query: '',
    category: '',
    sort: 'newest',
  })

  const categories = React.useMemo(
    () => Array.from(new Set(posts.map((p) => p.category))).sort((a, b) => a.localeCompare(b)),
    [posts],
  )

  const filtered = React.useMemo(() => {
    let result = posts.filter((p) => {
      const matchesQuery =
        filters.query === '' ||
        p.title.toLowerCase().includes(filters.query.toLowerCase()) ||
        p.excerpt.toLowerCase().includes(filters.query.toLowerCase()) ||
        p.tags.some((tag) => tag.toLowerCase().includes(filters.query.toLowerCase()))

      const matchesCategory = filters.category === '' || p.category === filters.category

      return matchesQuery && matchesCategory
    })

    result = [...result].sort((a, b) => {
      switch (filters.sort) {
        case 'newest':
          return new Date(b.date).getTime() - new Date(a.date).getTime()
        case 'oldest':
          return new Date(a.date).getTime() - new Date(b.date).getTime()
        case 'title-asc':
          return a.title.localeCompare(b.title)
        case 'title-desc':
          return b.title.localeCompare(a.title)
        default:
          return 0
      }
    })

    return result
  }, [posts, filters])

  const activeFiltersCount = [filters.category].filter(Boolean).length

  const clearFilters = React.useCallback(() => {
    setFilters((prev) => ({ ...prev, query: '', category: '' }))
  }, [])

  const setSort = React.useCallback((value: string) => {
    setFilters((prev) => ({ ...prev, sort: value as SortOption }))
  }, [])

  const setCategory = React.useCallback((value: string) => {
    setFilters((prev) => ({ ...prev, category: value }))
  }, [])

  return (
    <div className="space-y-6">
      {/* Filter bar */}
      <div className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input
            type="search"
            placeholder="Search articles..."
            value={filters.query}
            onChange={(e) => setFilters((prev) => ({ ...prev, query: e.target.value }))}
            className="pl-9"
          />
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <SlidersHorizontal className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            <Select
              value={filters.category}
              onChange={setCategory}
              placeholder="All categories"
              options={categories.map((c) => ({ value: c, label: c }))}
            />
          </div>

          <div className="flex items-center gap-2">
            <ArrowUpDown className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            <Select
              value={filters.sort}
              onChange={setSort}
              options={[
                { value: 'newest', label: 'Newest first' },
                { value: 'oldest', label: 'Oldest first' },
                { value: 'title-asc', label: 'Title A-Z' },
                { value: 'title-desc', label: 'Title Z-A' },
              ]}
            />
          </div>

          {activeFiltersCount > 0 && (
            <Button variant="ghost" size="sm" onClick={clearFilters} className="gap-1.5">
              <X className="h-4 w-4" />
              Clear filters
              <Badge variant="default" className="ml-1">
                {activeFiltersCount}
              </Badge>
            </Button>
          )}
        </div>
      </div>

      {/* Results */}
      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-card p-10 text-center">
          <Tag className="mx-auto h-10 w-10 text-muted-foreground" aria-hidden="true" />
          <h3 className="mt-4 text-lg font-bold text-foreground">No articles found</h3>
          <p className="mt-2 text-sm text-muted-foreground">
            Try adjusting your search or category filter.
          </p>
          {activeFiltersCount > 0 && (
            <Button variant="outline" size="sm" onClick={clearFilters} className="mt-4">
              Clear all filters
            </Button>
          )}
        </div>
      ) : (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((post) => (
            <ArticleCard key={post.slug} post={post} />
          ))}
        </div>
      )}
    </div>
  )
}
