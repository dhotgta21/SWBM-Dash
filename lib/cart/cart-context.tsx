// lib/cart/cart-context.tsx
// Anonymous shopping cart for the public site. State lives in localStorage
// so it survives page reloads without requiring any kind of account, and
// the cart context exposes a small, ergonomic API to the rest of the
// site via useCart().
//
// Why localStorage and not cookies?
//   - No server roundtrip on every add/remove.
//   - Survives across browser sessions on the same device.
//   - Easy to clear ("Empty cart" button).
//   - Cart can never contain anything sensitive — just product ids and
//     qtys — so the security model is the same as the public site
//     itself: untrusted, server-validated on submit.
//
// The provider hydrates from localStorage after mount to avoid SSR
// hydration mismatches; before hydration the cart renders as empty.
//
// Concurrency notes:
//   - A monotonically increasing `version` counter is bumped on every
//     state mutation and persisted alongside the items. The cross-tab
//     `storage` event handler IGNORES an inbound payload whose version
//     is not strictly greater than our current one. This stops the
//     previous race where a tab with in-flight additions could have
//     them silently reverted by an older storage event from another
//     tab that was closing.
//   - Persistence runs once per render-pass through a microtask flush
//     so a burst of setState calls in the same tick coalesces into one
//     localStorage write.
//   - If localStorage is unavailable (Safari private mode, quota full,
//     disabled in browser settings), we flip `persisted` to false so
//     the UI can warn the user their cart won't survive a refresh.

'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'

export interface CartItem {
  productId: string
  code: string
  name: string
  unit: string
  price: number | null
  /**
   * Pre-sale trade price. Set when the line was added at a sale price so the
   * cart can render a strikethrough next to the discounted `price`.
   */
  originalPrice?: number | null
  /** Sale label visible in the cart (e.g. "Winter Sale"). */
  saleLabel?: string | null
  quantity: number
  /** User-facing description of the selected variant (material, size, etc.). */
  variantDescription?: string
  /** Stable key for cart operations. productId + variant when variants are used. */
  cartKey: string
}

interface PersistedCart {
  version: number
  items: CartItem[]
}

interface CartState {
  items: CartItem[]
  hydrated: boolean
  /**
   * True while we can write to localStorage. Flips to false on quota
   * errors, Safari private mode, or any other write failure. UI should
   * surface a small "your cart won't be saved across sessions" warning
   * when false.
   */
  persisted: boolean
  /**
   * Monotonic version counter. Bumped on every mutation. Used to
   * discard stale cross-tab `storage` events.
   */
  version: number
}

interface CartApi extends CartState {
  add(item: Omit<CartItem, 'quantity' | 'cartKey'> & { quantity?: number }): void
  remove(cartKey: string): void
  setQuantity(cartKey: string, quantity: number): void
  clear(): void
  /** Total units across all lines (priced + unpriced). */
  count: number
  /** Subtotal for priced lines only. Unpriced lines are excluded. */
  subtotal: number
  /**
   * True when every line in the cart has a non-null price — i.e. the
   * customer can place an order without us having to phone them about
   * pricing first.
   */
  allPriced: boolean
  /** Number of distinct lines with a listed price. */
  pricedLineCount: number
  /** Number of distinct lines that need a quote before ordering. */
  unpricedLineCount: number
}

const CartContext = createContext<CartApi | null>(null)

const STORAGE_KEY = 'swbm:cart:v1'

function readStorage(): PersistedCart {
  if (typeof window === 'undefined') return { version: 0, items: [] }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return { version: 0, items: [] }
    const parsed = JSON.parse(raw) as unknown

    // New shape: { version, items }. Backwards-compat: bare array of
    // items from before the version field landed — treat as v0 with
    // those items so existing carts upgrade in place on first load.
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed) && 'items' in parsed) {
      const obj = parsed as { version?: unknown; items?: unknown }
      const version = typeof obj.version === 'number' ? obj.version : 0
      const items = Array.isArray(obj.items) ? sanitizeItems(obj.items) : []
      return { version, items }
    }

    if (Array.isArray(parsed)) {
      return { version: 0, items: sanitizeItems(parsed) }
    }
    return { version: 0, items: [] }
  } catch {
    return { version: 0, items: [] }
  }
}

function sanitizeItems(raw: unknown[]): CartItem[] {
  return raw.flatMap((row): CartItem[] => {
    if (
      row &&
      typeof row === 'object' &&
      'productId' in row &&
      typeof (row as { productId: unknown }).productId === 'string' &&
      'code' in row &&
      typeof (row as { code: unknown }).code === 'string' &&
      'name' in row &&
      typeof (row as { name: unknown }).name === 'string' &&
      'quantity' in row &&
      typeof (row as { quantity: unknown }).quantity === 'number'
    ) {
      const r = row as Partial<CartItem>
      return [
        {
          productId: r.productId!,
          code: r.code!,
          name: r.name!,
          unit: typeof r.unit === 'string' ? r.unit : 'EA',
          price: typeof r.price === 'number' ? r.price : null,
          // Preserve the pre-sale price + label across localStorage reads
          // so the cart can still render a strikethrough on sale lines
          // after a refresh.
          originalPrice:
            typeof r.originalPrice === 'number' ? r.originalPrice : null,
          saleLabel: typeof r.saleLabel === 'string' ? r.saleLabel : null,
          quantity: r.quantity!,
          variantDescription:
            typeof r.variantDescription === 'string' ? r.variantDescription : undefined,
          cartKey:
            typeof r.cartKey === 'string'
              ? r.cartKey
              : `${r.productId}|${(r as Partial<CartItem>).variantDescription || ''}`,
        },
      ]
    }
    return []
  })
}

function writeStorage(payload: PersistedCart): boolean {
  if (typeof window === 'undefined') return false
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload))
    return true
  } catch {
    // localStorage may be disabled (Safari private mode, etc.) —
    // signal the caller so it can flip the `persisted` flag and the
    // UI can warn the user.
    return false
  }
}

export function CartProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<CartState>({
    items: [],
    hydrated: false,
    persisted: true,
    version: 0,
  })

  // Tracks the latest version we've persisted to localStorage. We use
  // a ref (not state) so updating it does not trigger a re-render — it
  // is only consulted by the storage-event handler below.
  const lastPersistedVersionRef = useRef<number>(0)
  // Tracks the latest version we've emitted as the source of truth.
  // Bumped inside the same render pass as the matching setState so the
  // ordering of local writes vs cross-tab events stays monotonic.
  const currentVersionRef = useRef<number>(0)

  // Hydrate once on mount. Defer with requestAnimationFrame to avoid
  // synchronous setState inside the effect body.
  useEffect(() => {
    const id = requestAnimationFrame(() => {
      const stored = readStorage()
      currentVersionRef.current = stored.version
      lastPersistedVersionRef.current = stored.version
      setState({
        items: stored.items,
        hydrated: true,
        persisted: true,
        version: stored.version,
      })
    })
    return () => cancelAnimationFrame(id)
  }, [])

  // Persist on every change (post-hydration only). Coalesced through a
  // microtask so a burst of setState calls in the same tick writes
  // exactly once.
  useEffect(() => {
    if (!state.hydrated) return
    let cancelled = false
    queueMicrotask(() => {
      if (cancelled) return
      if (state.version === lastPersistedVersionRef.current) return
      const ok = writeStorage({ version: state.version, items: state.items })
      if (ok) {
        lastPersistedVersionRef.current = state.version
        if (!state.persisted) {
          setState((prev) => ({ ...prev, persisted: true }))
        }
      } else if (state.persisted) {
        setState((prev) => ({ ...prev, persisted: false }))
      }
    })
    return () => {
      cancelled = true
    }
  }, [state.items, state.hydrated, state.version, state.persisted])

  // Cross-tab sync. We only adopt an inbound payload if its version
  // is strictly greater than our last-known persisted version. This
  // means an "older" tab closing and emitting its storage event can
  // never silently overwrite a newer tab's in-flight changes.
  useEffect(() => {
    function onStorage(e: StorageEvent) {
      if (e.key !== STORAGE_KEY) return
      const incoming = readStorage()
      if (incoming.version <= lastPersistedVersionRef.current) {
        // Either a stale event from a closing tab, or our own write
        // echoed back. Either way: ignore.
        return
      }
      currentVersionRef.current = incoming.version
      lastPersistedVersionRef.current = incoming.version
      setState({
        items: incoming.items,
        hydrated: true,
        persisted: true,
        version: incoming.version,
      })
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  const add = useCallback<CartApi['add']>((item) => {
    const quantity = item.quantity ?? 1
    const variantDescription = item.variantDescription?.trim() || ''
    const cartKey = `${item.productId}|${variantDescription}`
    setState((prev) => {
      const nextVersion = prev.version + 1
      currentVersionRef.current = nextVersion
      const existing = prev.items.find((i) => i.cartKey === cartKey)
      if (existing) {
        return {
          ...prev,
          version: nextVersion,
          items: prev.items.map((i) =>
            i.cartKey === cartKey ? { ...i, quantity: i.quantity + quantity } : i
          ),
        }
      }
      return {
        ...prev,
        version: nextVersion,
        items: [
          ...prev.items,
          {
            productId: item.productId,
            code: item.code,
            name: item.name,
            unit: item.unit,
            price: item.price,
            originalPrice: item.originalPrice ?? null,
            saleLabel: item.saleLabel ?? null,
            quantity,
            variantDescription: variantDescription || undefined,
            cartKey,
          },
        ],
      }
    })
  }, [])

  const remove = useCallback<CartApi['remove']>((cartKey) => {
    setState((prev) => {
      const nextVersion = prev.version + 1
      currentVersionRef.current = nextVersion
      return {
        ...prev,
        version: nextVersion,
        items: prev.items.filter((i) => i.cartKey !== cartKey),
      }
    })
  }, [])

  const setQuantity = useCallback<CartApi['setQuantity']>(
    (cartKey, quantity) => {
      const safe = Number.isFinite(quantity) ? Math.max(0, Math.floor(quantity)) : 0
      setState((prev) => {
        const nextVersion = prev.version + 1
        currentVersionRef.current = nextVersion
        return {
          ...prev,
          version: nextVersion,
          items:
            safe === 0
              ? prev.items.filter((i) => i.cartKey !== cartKey)
              : prev.items.map((i) =>
                  i.cartKey === cartKey ? { ...i, quantity: safe } : i
                ),
        }
      })
    },
    []
  )

  const clear = useCallback(() => {
    setState((prev) => {
      const nextVersion = prev.version + 1
      currentVersionRef.current = nextVersion
      return { ...prev, version: nextVersion, items: [] }
    })
  }, [])

  const api = useMemo<CartApi>(() => {
    const count = state.items.reduce((sum, i) => sum + i.quantity, 0)
    const subtotal = state.items.reduce(
      (sum, i) => sum + (i.price ?? 0) * i.quantity,
      0
    )
    const pricedLineCount = state.items.filter((i) => i.price !== null).length
    const unpricedLineCount = state.items.length - pricedLineCount
    const allPriced = state.items.length > 0 && unpricedLineCount === 0
    return {
      ...state,
      add,
      remove,
      setQuantity,
      clear,
      count,
      subtotal,
      pricedLineCount,
      unpricedLineCount,
      allPriced,
    }
  }, [state, add, remove, setQuantity, clear])

  return <CartContext.Provider value={api}>{children}</CartContext.Provider>
}

export function useCart(): CartApi {
  const ctx = useContext(CartContext)
  if (!ctx) {
    throw new Error('useCart must be used inside <CartProvider>')
  }
  return ctx
}
