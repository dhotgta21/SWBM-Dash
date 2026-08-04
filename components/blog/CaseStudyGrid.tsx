'use client'

// components/blog/CaseStudyGrid.tsx
// Interactive case-study grid with search, filtering and sorting. Keeps
// the index static while giving users a fast, client-side way to explore
// the portfolio by type, town, county or date.

import * as React from 'react'
import { Search, SlidersHorizontal, X, MapPin, MapPinned, ArrowUpDown, Building2 } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { CaseStudyCard } from '@/components/blog/CaseStudyCard'
import type { CaseStudyPost, ProjectType } from '@/lib/blog/loader'

const TYPE_LABELS: Record<ProjectType, string> = {
  extension: 'Extensions',
  'loft-conversion': 'Loft conversions',
  'self-build': 'Self-builds',
  'new-build': 'New builds',
  'garden-office': 'Garden offices & outbuildings',
  commercial: 'Commercial fit-outs',
  renovation: 'Renovations',
  outbuilding: 'Outbuildings',
  refurbishment: 'Refurbishments',
  reroof: 'Re-roofs',
  'garage-conversion': 'Garage conversions',
  'barn-conversion': 'Barn conversions',
  driveway: 'Driveways & landscaping',
}

type SortOption = 'newest' | 'oldest' | 'title-asc' | 'title-desc' | 'town-asc'

interface CaseStudyGridProps {
  readonly posts: readonly CaseStudyPost[]
}

interface FilterState {
  query: string
  type: string
  town: string
  county: string
  sort: SortOption
}

export function CaseStudyGrid({ posts }: CaseStudyGridProps) {
  const [filters, setFilters] = React.useState<FilterState>({
    query: '',
    type: '',
    town: '',
    county: '',
    sort: 'newest',
  })

  const towns = React.useMemo(
    () => Array.from(new Set(posts.map((p) => p.town))).sort((a, b) => a.localeCompare(b)),
    [posts],
  )

  const counties = React.useMemo(
    () => Array.from(new Set(posts.map((p) => p.county))).sort((a, b) => a.localeCompare(b)),
    [posts],
  )

  const types = React.useMemo(
    () => Array.from(new Set(posts.map((p) => p.projectType))).sort((a, b) => a.localeCompare(b)),
    [posts],
  )

  const filtered = React.useMemo(() => {
    let result = posts.filter((p) => {
      const matchesQuery =
        filters.query === '' ||
        p.title.toLowerCase().includes(filters.query.toLowerCase()) ||
        p.town.toLowerCase().includes(filters.query.toLowerCase()) ||
        p.county.toLowerCase().includes(filters.query.toLowerCase()) ||
        p.excerpt.toLowerCase().includes(filters.query.toLowerCase()) ||
        p.tags.some((tag) => tag.toLowerCase().includes(filters.query.toLowerCase()))

      const matchesType = filters.type === '' || p.projectType === filters.type
      const matchesTown = filters.town === '' || p.town === filters.town
      const matchesCounty = filters.county === '' || p.county === filters.county

      return matchesQuery && matchesType && matchesTown && matchesCounty
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
        case 'town-asc':
          return a.town.localeCompare(b.town) || a.title.localeCompare(b.title)
        default:
          return 0
      }
    })

    return result
  }, [posts, filters])

  const activeFiltersCount = [filters.type, filters.town, filters.county].filter(Boolean).length

  const clearFilters = React.useCallback(() => {
    setFilters((prev) => ({ ...prev, query: '', type: '', town: '', county: '' }))
  }, [])

  const setSort = React.useCallback((value: string) => {
    setFilters((prev) => ({ ...prev, sort: value as SortOption }))
  }, [])

  const setType = React.useCallback((value: string) => {
    setFilters((prev) => ({ ...prev, type: value }))
  }, [])

  const setTown = React.useCallback((value: string) => {
    setFilters((prev) => ({ ...prev, town: value }))
  }, [])

  const setCounty = React.useCallback((value: string) => {
    setFilters((prev) => ({ ...prev, county: value }))
  }, [])

  return (
    <div className="space-y-8">
      {/* Filter bar */}
      <div className="rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="flex flex-1 flex-col gap-4 lg:flex-row lg:items-end">
            <div className="relative flex-1">
              <label htmlFor="case-study-search" className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Search
              </label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                <Input
                  id="case-study-search"
                  type="search"
                  placeholder="Search by project, town or keyword..."
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

            <div className="grid flex-1 gap-4 sm:grid-cols-3 lg:flex-none lg:min-w-[28rem]">
              <div>
                <label htmlFor="filter-type" className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  <span className="inline-flex items-center gap-1">
                    <Building2 className="h-3.5 w-3.5" aria-hidden="true" />
                    Project type
                  </span>
                </label>
                <Select
                  id="filter-type"
                  placeholder="All types"
                  value={filters.type}
                  onChange={setType}
                  options={types.map((t) => ({ value: t, label: TYPE_LABELS[t] ?? t }))}
                />
              </div>

              <div>
                <label htmlFor="filter-town" className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  <span className="inline-flex items-center gap-1">
                    <MapPin className="h-3.5 w-3.5" aria-hidden="true" />
                    Town
                  </span>
                </label>
                <Select
                  id="filter-town"
                  placeholder="All towns"
                  value={filters.town}
                  onChange={setTown}
                  options={towns.map((t) => ({ value: t, label: t }))}
                />
              </div>

              <div>
                <label htmlFor="filter-county" className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  <span className="inline-flex items-center gap-1">
                    <MapPinned className="h-3.5 w-3.5" aria-hidden="true" />
                    County
                  </span>
                </label>
                <Select
                  id="filter-county"
                  placeholder="All counties"
                  value={filters.county}
                  onChange={setCounty}
                  options={counties.map((c) => ({ value: c, label: c }))}
                />
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="min-w-[10rem]">
              <label htmlFor="sort-by" className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                <span className="inline-flex items-center gap-1">
                  <ArrowUpDown className="h-3.5 w-3.5" aria-hidden="true" />
                  Sort by
                </span>
              </label>
              <Select
                id="sort-by"
                value={filters.sort}
                onChange={setSort}
                options={[
                  { value: 'newest', label: 'Newest first' },
                  { value: 'oldest', label: 'Oldest first' },
                  { value: 'title-asc', label: 'Title A–Z' },
                  { value: 'title-desc', label: 'Title Z–A' },
                  { value: 'town-asc', label: 'Town A–Z' },
                ]}
              />
            </div>

            {activeFiltersCount > 0 && (
              <Button variant="outline" size="sm" onClick={clearFilters} className="mt-5">
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
            {filters.type && (
              <FilterChip
                label={TYPE_LABELS[filters.type as ProjectType] ?? filters.type}
                onRemove={() => setFilters((prev) => ({ ...prev, type: '' }))}
              />
            )}
            {filters.town && (
              <FilterChip label={filters.town} onRemove={() => setFilters((prev) => ({ ...prev, town: '' }))} />
            )}
            {filters.county && (
              <FilterChip label={filters.county} onRemove={() => setFilters((prev) => ({ ...prev, county: '' }))} />
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
              ? 'No case studies found'
              : `${filtered.length} case stud${filtered.length === 1 ? 'y' : 'ies'}`}
          </h2>
        </div>
        <p className="text-sm text-muted-foreground">
          {filtered.length > 0 && `Showing ${filtered.length} of ${posts.length} projects`}
        </p>
      </div>

      {/* Grid */}
      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-card p-12 text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-muted">
            <Search className="h-7 w-7 text-muted-foreground" aria-hidden="true" />
          </div>
          <h3 className="mt-4 text-lg font-bold text-foreground">No matching case studies</h3>
          <p className="mt-2 max-w-md mx-auto text-sm text-muted-foreground">
            Try adjusting your search or filters to find what you&apos;re looking for.
          </p>
          <Button variant="outline" onClick={clearFilters} className="mt-6">
            Clear all filters
          </Button>
        </div>
      ) : filters.sort === 'newest' || filters.sort === 'oldest' ? (
        // Flat chronological grid when sorting by date
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((p) => (
            <CaseStudyCard key={p.slug} post={p} showType />
          ))}
        </div>
      ) : (
        // Grouped by project type for other sorts
        <GroupedGrid posts={filtered} />
      )}
    </div>
  )
}

function GroupedGrid({ posts }: { readonly posts: readonly CaseStudyPost[] }) {
  const grouped = React.useMemo(() => {
    const map = new Map<ProjectType, CaseStudyPost[]>()
    for (const p of posts) {
      const arr = map.get(p.projectType) ?? []
      arr.push(p)
      map.set(p.projectType, arr)
    }
    return map
  }, [posts])

  const orderedTypes = React.useMemo(
    () =>
      Array.from(grouped.keys()).sort((a, b) => {
        const da = grouped.get(a)!.length
        const db = grouped.get(b)!.length
        if (db !== da) return db - da
        return a.localeCompare(b)
      }),
    [grouped],
  )

  return (
    <div className="space-y-14">
      {orderedTypes.map((type) => (
        <section key={type} aria-labelledby={`type-${type}`}>
          <div className="flex items-end justify-between gap-4">
            <div>
              <h2
                id={`type-${type}`}
                className="text-2xl font-extrabold tracking-tight text-foreground sm:text-3xl"
              >
                {TYPE_LABELS[type] ?? type}
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {grouped.get(type)!.length} case stud{grouped.get(type)!.length === 1 ? 'y' : 'ies'}
              </p>
            </div>
          </div>
          <div className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {grouped.get(type)!.map((p) => (
              <CaseStudyCard key={p.slug} post={p} showType={false} />
            ))}
          </div>
        </section>
      ))}
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
