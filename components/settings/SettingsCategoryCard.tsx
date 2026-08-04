import Link from 'next/link'
import type { LucideIcon } from 'lucide-react'
import { ArrowRight } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'

interface SettingsCategoryCardProps {
  href: string
  icon: LucideIcon
  title: string
  description: string
  className?: string
}

export function SettingsCategoryCard({
  href,
  icon: Icon,
  title,
  description,
  className,
}: SettingsCategoryCardProps) {
  return (
    <Link href={href} className={cn('group block', className)}>
      <Card className="h-full transition-shadow hover:shadow-md hover:border-primary/30">
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Icon className="h-5 w-5" />
            </div>
            <ArrowRight className="h-5 w-5 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
          </div>
          <CardTitle className="pt-2 text-lg">{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        <CardContent className="pt-0">
          <span className="text-sm font-medium text-primary group-hover:underline">
            Manage {title.toLowerCase()}
          </span>
        </CardContent>
      </Card>
    </Link>
  )
}
