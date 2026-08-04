'use client'

// Subscribes to changes on the delivery_alerts table and triggers a router
// refresh whenever a row is inserted, updated, or deleted. The alert banner
// on the dashboard, the sidebar count badge, and any other server component
// that reads delivery_alerts all re-fetch from the same source of truth.
//
// The DB side of this lives in supabase/migrations/129_undelivered_alerts_pg_cron.sql:
//   * pg_cron calls raise_undelivered_alerts() every 30 min
//   * Triggers on delivery_loads / invoices call the same function on relevant
//     state changes for instant resolution
// This component just makes the page "feel" instant when those writes happen.

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

interface DeliveryAlertsNotificationsProps {
  /** Only users who can see delivery alerts should subscribe. */
  enabled: boolean
}

export function DeliveryAlertsNotifications({ enabled }: DeliveryAlertsNotificationsProps) {
  const router = useRouter()

  useEffect(() => {
    if (!enabled) return

    const supabase = createClient()
    const channel = supabase
      .channel('delivery-alerts-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'delivery_alerts' },
        () => {
          // The alerts table changed -- re-run the server components so the
          // banner, sidebar badge, and any other consumer all pick up the
          // new state from the DB.
          router.refresh()
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [enabled, router])

  return null
}
