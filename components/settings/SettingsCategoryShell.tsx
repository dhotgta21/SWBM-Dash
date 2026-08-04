import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { PageHeader } from '@/components/ui/PageHeader'
import { cn } from '@/lib/utils'

interface SettingsCategoryShellProps {
  title: string
  description?: string
  children: React.ReactNode
  className?: string
}

export function SettingsCategoryShell({
  title,
  description,
  children,
  className,
}: SettingsCategoryShellProps) {
  return (
    <div className={cn('space-y-6', className)}>
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/settings" className="gap-1.5 text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" />
            Back to settings
          </Link>
        </Button>
      </div>

      <PageHeader title={title} description={description} />

      {children}
    </div>
  )
}
