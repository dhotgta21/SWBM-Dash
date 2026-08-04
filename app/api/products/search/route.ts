import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getOperatorContext } from '@/lib/auth/context'
import { sanitizeLikeTerm } from '@/lib/search'

export async function GET(request: NextRequest) {
  const ctx = await getOperatorContext()
  if (!ctx) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const q = searchParams.get('q')?.trim() ?? ''

  if (q.length < 2) {
    return NextResponse.json({ products: [] })
  }

  const supabase = await createClient()
  // Escape LIKE wildcards (% _ \) so the search term stays literal.
  const likeTerm = sanitizeLikeTerm(q)
  if (!likeTerm) {
    return NextResponse.json({ products: [] })
  }
  const likePattern = `%${likeTerm}%`

  // Search by name and code separately to avoid manual filter-string escaping.
  const [nameResult, codeResult] = await Promise.all([
    supabase
      .from('products')
      .select('id, code, name, category, default_price')
      .is('deleted_at', null)
      .eq('is_temporary', false)
      .gt('default_price', 0)
      .is('price_from', null)
      .ilike('name', likePattern)
      .order('name')
      .limit(20),
    supabase
      .from('products')
      .select('id, code, name, category, default_price')
      .is('deleted_at', null)
      .eq('is_temporary', false)
      .gt('default_price', 0)
      .is('price_from', null)
      .ilike('code', likePattern)
      .order('name')
      .limit(20),
  ])

  if (nameResult.error || codeResult.error) {
    console.error('Product search error:', nameResult.error || codeResult.error)
    return NextResponse.json({ error: 'Could not search products' }, { status: 500 })
  }

  const seen = new Set<string>()
  const products = []
  for (const row of [...(nameResult.data ?? []), ...(codeResult.data ?? [])]) {
    if (seen.has(row.id)) continue
    seen.add(row.id)
    products.push(row)
  }

  return NextResponse.json({ products: products.slice(0, 20) })
}
