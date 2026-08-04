// app/(portal)/portal/tools/page.tsx
// Hub page for the client portal tools section.

import Link from 'next/link'
import { Package, FileText, User, ArrowRight } from 'lucide-react'
import { EyebrowChip } from '@/components/ui/PageHeader'

const TOOLS = [
  {
    slug: 'inventory',
    href: '/portal/inventory',
    icon: Package,
    title: 'Inventory',
    description: 'Track what you have bought, mark stock as used, and see low-stock alerts.',
    cta: 'Manage inventory',
  },
  {
    slug: 'quotes',
    href: '/portal/quotes',
    icon: FileText,
    title: 'Quotes',
    description: 'Create a new quote request or check the status of quotes you have sent.',
    cta: 'View quotes',
  },
  {
    slug: 'profile',
    href: '/portal/profile',
    icon: User,
    title: 'My profile',
    description: 'Review the contact and delivery details we have on file.',
    cta: 'View profile',
  },
]

export const metadata = {
  title: 'Tools',
}

export default function PortalToolsPage() {
  return (
    <div className="space-y-6">
      <header className="border-b border-border/70 pb-6">
        <EyebrowChip label="Client portal" tone="info" />
        <h1 className="mt-3 text-2xl font-semibold tracking-tight text-foreground sm:text-[1.7rem]">
          Tools
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          Everything you need to manage your materials and request quotes online.
        </p>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {TOOLS.map((tool) => {
          const Icon = tool.icon
          return (
            <Link
              key={tool.slug}
              href={tool.href}
              className="group flex flex-col rounded-xl border border-border bg-card p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-md"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                <Icon className="h-5 w-5 text-primary" />
              </div>
              <h2 className="mt-4 text-lg font-semibold text-foreground">{tool.title}</h2>
              <p className="mt-2 flex-1 text-sm text-muted-foreground">{tool.description}</p>
              <span className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-primary">
                {tool.cta}
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              </span>
            </Link>
          )
        })}
      </div>
    </div>
  )
}
