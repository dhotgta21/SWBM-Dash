import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function createClient() {
  const cookieStore = await cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value
        },
        set(name: string, value: string, options: CookieOptions) {
          try {
            cookieStore.set({ name, value, ...options })
          } catch (e) {
            // The `set` method can throw when called from a Server Component.
            // Log it so auth issues are visible in server logs; middleware will
            // still refresh the session on the next request if it can.
            console.error('Supabase server client: failed to set cookie', name, e)
          }
        },
        remove(name: string, options: CookieOptions) {
          try {
            cookieStore.set({ name, value: '', ...options })
          } catch (e) {
            console.error('Supabase server client: failed to remove cookie', name, e)
          }
        },
      },
    }
  )
}
