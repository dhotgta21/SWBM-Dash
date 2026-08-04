import { ClipboardCheck } from 'lucide-react'
import { getPickerQueue } from '@/lib/actions/picker'
import { PickerQueueList } from './PickerQueueList'

export const dynamic = 'force-dynamic'

export default async function PickerQueuePage() {
  const { invoices, error } = await getPickerQueue()

  if (error) {
    return (
      <div className="p-4 text-center text-destructive">
        <p>{error}</p>
      </div>
    )
  }

  if (!invoices || invoices.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] p-4 text-center">
        <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-secondary text-muted-foreground">
          <ClipboardCheck className="h-6 w-6" />
        </div>
        <h1 className="text-lg font-semibold text-foreground">All caught up</h1>
        <p className="mt-1 text-sm text-muted-foreground">No orders to pick right now.</p>
      </div>
    )
  }

  return <PickerQueueList invoices={invoices} />
}
