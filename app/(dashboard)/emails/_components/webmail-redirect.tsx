'use client'

import { ExternalLink, Mail, Settings as SettingsIcon } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import Link from 'next/link'

interface WebmailRedirectProps {
  webmailUrl: string
}

export function WebmailRedirect({ webmailUrl }: WebmailRedirectProps) {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <Card className="w-full max-w-lg">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
            <Mail className="h-6 w-6 text-primary" />
          </div>
          <CardTitle>Company webmail</CardTitle>
          <CardDescription>
            Open your configured inbox in a new tab. Your dashboard stays right here.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 text-center">
          <p className="font-mono text-xs text-muted-foreground break-all">{webmailUrl}</p>

          <div className="flex flex-col gap-2 pt-2">
            <Button asChild>
              <a href={webmailUrl} target="_blank" rel="noopener noreferrer">
                Open webmail now <ExternalLink className="ml-2 h-4 w-4" />
              </a>
            </Button>
            <Button variant="outline" asChild>
              <Link href="/settings/company">
                <SettingsIcon className="mr-2 h-4 w-4" />
                Change destination
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
