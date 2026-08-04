'use client'

import { useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Inbox } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { playNotificationSound } from '@/lib/sound'

interface QuoteNotificationsProps {
  /** Only admins (and staff with see_quote_requests, when RLS allows) should subscribe. */
  enabled: boolean
}

export function QuoteNotifications({ enabled }: QuoteNotificationsProps) {
  const router = useRouter()
  const lastEventTime = useRef<number>(Date.now())

  useEffect(() => {
    if (!enabled) return

    const supabase = createClient()
    const channel = supabase
      .channel('quote-requests-notifications')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'quote_requests',
        },
        (payload) => {
          // Ignore events that fire immediately on subscription (if any) and
          // avoid duplicate toasts when multiple tabs are open.
          const eventTime = Date.now()
          if (eventTime - lastEventTime.current < 500) return
          lastEventTime.current = eventTime

          const newRow = payload.new as {
            id?: string
            request_number?: string | null
            client_name?: string | null
            client_company?: string | null
          } | null

          const requestNumber = newRow?.request_number ?? 'New request'
          const clientName = newRow?.client_name ?? 'A visitor'
          const company = newRow?.client_company
            ? ` (${newRow.client_company})`
            : ''

          playNotificationSound()
          toast(
            <div className="flex items-start gap-3">
              <div className="mt-0.5 rounded-full bg-warning-muted p-1.5 text-warning">
                <Inbox className="h-4 w-4" />
              </div>
              <div>
                <p className="font-medium">New quote request</p>
                <p className="text-sm text-muted-foreground">
                  {requestNumber} from {clientName}
                  {company}
                </p>
              </div>
            </div>,
            {
              duration: 8000,
              action: {
                label: 'View',
                onClick: () => {
                  if (newRow?.id) {
                    router.push(`/quote-requests/${newRow.id}`)
                  } else {
                    router.push('/quote-requests')
                  }
                },
              },
            }
          )
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [enabled, router])

  return null
}
