'use client'

// components/blog/GuidesGrid.tsx
// Interactive how-to guides grid with search, category filter, difficulty
// filter and sort. Mirrors the API and visual rhythm of ArticleGrid and
// CaseStudyGrid so the three indexes feel like one surface — same
// rounded-2xl filter bar, same labelled select rows, same active-filter
// chips, same empty-state pattern.
//
// Used by app/guides/page.tsx (the resources hub). The grid renders the
// guide cards in a 1/2/3-column responsive layout via GuideCard.

import * as React from 'react'
import {
  Search,
  SlidersHorizontal,
  X,
  Tag,
  ArrowUpDown,
  Hammer,
  Layers,
} from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { GuideCard } from '@/components/blog/GuideCard'
import type { GuidePost } from '@/lib/guides/loader'

type SortOption = 'newest' | 'oldest' | 'title-asc' | 'title-desc'
type Difficulty = GuidePost['difficulty']

const DIFFICULTY_LABELS: Record<Difficulty, string> = {
  beginner: 'Beginner',
  intermediate: 'Intermediate',
  advanced: 'Advanced',
}

interface GuidesGridProps {
  readonly guides: readonly GuidePost[]
}

interface FilterState {
  query: string
  category: string
  difficulty: string
  sort: SortOption
}

export function GuidesGrid({ guides }: GuidesGridProps) {
  const [filters, setFilters] = React.useState<FilterState>({
    query: '',
    category: '',
    difficulty: '',
    sort: 'newest',
  })

  const categories = React.useMemo(
    () => Array.from(new Set(guides.map((g) => g.category))).sort((a, b) => a.localeCompare(b)),
    [guides],
  )

  const filtered = React.useMemo(() => {
    const q = filters.query.trim().toLowerCase()
    let result = guides.filter((g) => {
      const matchesQuery =
        q === '' ||
        g.title.toLowerCase().includes(q) ||
        g.excerpt.toLowerCase().includes(q) ||
        g.description.toLowerCase().includes(q) ||
        g.tags.some((tag) => tag.toLowerCase().includes(q))

      const matchesCategory = filters.category === '' || g.category === filters.category
      const matchesDifficulty = filters.difficulty === '' || g.difficulty === filters.difficulty

      return matchesQuery && matchesCategory && matchesDifficulty
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
          return b.title.localeCompare(b.title)
        default:
          return 0
      }
    })

    return result
  }, [guides, filters])

  const activeFiltersCount = [filters.category, filters.difficulty].filter(Boolean).length

  const clearFilters = React.useCallback(() => {
    setFilters((prev) => ({ ...prev, query: '', category: '', difficulty: '' }))
  }, [])

  const setSort = React.useCallback((value: string) => {
    setFilters((prev) => ({ ...prev, sort: value as SortOption }))
  }, [])

  const setCategory = React.useCallback((value: string) => {
    setFilters((prev) => ({ ...prev, category: value }))
  }, [])

  const setDifficulty = React.useCallback((value: string) => {
    setFilters((prev) => ({ ...prev, difficulty: value }))
  }, [])

  return (
    <div className="space-y-6">
      {/* Filter bar */}
      <div className="rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="flex flex-1 flex-col gap-4 lg:flex-row lg:items-end">
            <div className="relative flex-1">
              <label
                htmlFor="guides-search"
                className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted-foreground"
              >
                Search
              </label>
              <div className="relative">
                <Search
                  className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                  aria-hidden="true"
                />
                <Input
                  id="guides-search"
                  type="search"
                  placeholder="Search guides by title, tag or keyword..."
                  value={filters.query}
                  onChange={(e) => setFilters((prev) => ({ ...prev, query: e.target.value }))}
                  className="pl-9"
                />
                {filters.query && (
                  <button
                    type="button"
                    onClick={() => setFilters((prev) => ({ ...prev, query: '' }))}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    aria-label="Clear search"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
            </div>

            <div className="grid flex-1 gap-4 sm:grid-cols-2 lg:flex-none lg:min-w-[24rem]">
              <div>
                <label
                  htmlFor="guides-category"
                  className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted-foreground"
                >
                  <span className="inline-flex items-center gap-1">
                    <Tag className="h-3.5 w-3.5" aria-hidden="true" />
                    Category
                  </span>
                </label>
                <Select
                  id="guides-category"
                  placeholder="All categories"
                  value={filters.category}
                  onChange={setCategory}
                  options={categories.map((c) => ({ value: c, label: c }))}
                />
              </div>

              <div>
                <label
                  htmlFor="guides-difficulty"
                  className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted-foreground"
                >
                  <span className="inline-flex items-center gap-1">
                    <Hammer className="h-3.5 w-3.5" aria-hidden="true" />
                    Difficulty
                  </span>
                </label>
                <Select
                  id="guides-difficulty"
                  placeholder="Any level"
                  value={filters.difficulty}
                  onChange={setDifficulty}
                  options={[
                    { value: 'beginner', label: 'Beginner' },
                    { value: 'intermediate', label: 'Intermediate' },
                    { value: 'advanced', label: 'Advanced' },
                  ]}
                />
              </div>
            </div>
          </div>

          <div className="flex items-end gap-3">
            <div className="min-w-[10rem]">
              <label
                htmlFor="guides-sort"
                className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted-foreground"
              >
                <span className="inline-flex items-center gap-1">
                  <ArrowUpDown className="h-3.5 w-3.5" aria-hidden="true" />
                  Sort by
                </span>
              </label>
              <Select
                id="guides-sort"
                value={filters.sort}
                onChange={setSort}
                options={[
                  { value: 'newest', label: 'Newest first' },
                  { value: 'oldest', label: 'Oldest first' },
                  { value: 'title-asc', label: 'Title A–Z' },
                  { value: 'title-desc', label: 'Title Z–A' },
                ]}
              />
            </div>

            {activeFiltersCount > 0 && (
              <Button variant="outline" size="sm" onClick={clearFilters} className="lg:mt-5">
                <X className="mr-1 h-4 w-4" />
                Clear
              </Button>
            )}
          </div>
        </div>

        {/* Active filter chips */}
        {activeFiltersCount > 0 && (
          <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-border pt-4">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Active filters:
            </span>
            {filters.category && (
              <FilterChip
                label={filters.category}
                onRemove={() => setFilters((prev) => ({ ...prev, category: '' }))}
              />
            )}
            {filters.difficulty && (
              <FilterChip
                label={DIFFICULTY_LABELS[filters.difficulty as Difficulty] ?? filters.difficulty}
                onRemove={() => setFilters((prev) => ({ ...prev, difficulty: '' }))}
              />
            )}
          </div>
        )}
      </div>

      {/* Results header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <SlidersHorizontal className="h-4 w-4 text-primary" aria-hidden="true" />
          <h2 className="text-lg font-bold tracking-tight text-foreground">
            {filtered.length === 0
              ? 'No guides found'
              : `${filtered.length} guide${filtered.length === 1 ? '' : 's'}`}
          </h2>
        </div>
        <p className="text-sm text-muted-foreground">
          {filtered.length > 0 && `Showing ${filtered.length} of ${guides.length} guides`}
        </p>
      </div>

      {/* Grid */}
      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-card p-12 text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-muted">
            <Search className="h-7 w-7 text-muted-foreground" aria-hidden="true" />
          </div>
          <h3 className="mt-4 text-lg font-bold text-foreground">No matching guides</h3>
          <p className="mt-2 max-w-md mx-auto text-sm text-muted-foreground">
            Try adjusting your search or filters to find what you&rsquo;re looking for.
          </p>
          <Button variant="outline" onClick={clearFilters} className="mt-6">
            Clear all filters
          </Button>
        </div>
      ) : (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((guide) => (
            <GuideCard key={guide.slug} guide={guide} />
          ))}
        </div>
      )}
    </div>
  )
}

function FilterChip({ label, onRemove }: { readonly label: string; readonly onRemove: () => void }) {
  return (
    <Badge variant="primary" className="pr-1">
      {label}
      <button
        type="button"
        onClick={onRemove}
        className="ml-1.5 rounded-full p-0.5 hover:bg-primary/20"
        aria-label={`Remove ${label} filter`}
      >
        <X className="h-3 w-3" />
      </button>
    </Badge>
  )
}