import { useEffect, useState } from 'react'

/**
 * Returns true once the component has mounted in the browser.
 *
 * Useful for avoiding SSR/hydration mismatches when rendering something
 * that depends on `window` or `document` (e.g. a portal). The state update
 * is deferred with requestAnimationFrame so it does not run synchronously
 * inside the effect body.
 */
export function useMounted(): boolean {
  const [mounted, setMounted] = useState(false)
  useEffect(() => {
    const id = requestAnimationFrame(() => setMounted(true))
    return () => cancelAnimationFrame(id)
  }, [])
  return mounted
}
