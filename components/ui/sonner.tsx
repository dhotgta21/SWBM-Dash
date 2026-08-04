'use client'

import { Toaster as SonnerToaster, type ToasterProps } from 'sonner'

export function Toaster(props: ToasterProps) {
  return (
    <SonnerToaster
      position="top-right"
      duration={5000}
      closeButton
      richColors
      toastOptions={{
        classNames: {
          toast:
            'group toast bg-card text-card-foreground border-border shadow-lg rounded-lg',
          title: 'text-sm font-medium',
          description: 'text-sm text-muted-foreground',
          actionButton:
            'bg-primary text-primary-foreground hover:bg-primary-hover',
          cancelButton:
            'bg-secondary text-secondary-foreground hover:bg-secondary-hover',
          closeButton:
            'text-muted-foreground hover:text-foreground',
        },
      }}
      {...props}
    />
  )
}
