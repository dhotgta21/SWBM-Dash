'use client'

import * as React from 'react'
import { cn } from '@/lib/utils'
import { X } from 'lucide-react'

interface DialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  children: React.ReactNode
  className?: string
}

function Dialog({ open, onOpenChange, children, className }: DialogProps) {
  // Lock body scroll while the dialog is open so the page underneath
  // doesn't give you a second scroll context. We compensate for the
  // scrollbar disappearing to avoid layout shift on desktop.
  React.useEffect(() => {
    if (!open) return
    if (typeof document === 'undefined') return

    const body = document.body
    const scrollBarWidth = window.innerWidth - document.documentElement.clientWidth
    const previousOverflow = body.style.overflow
    const previousPaddingRight = body.style.paddingRight

    body.style.overflow = 'hidden'
    if (scrollBarWidth > 0) {
      body.style.paddingRight = `${scrollBarWidth}px`
    }

    return () => {
      body.style.overflow = previousOverflow
      body.style.paddingRight = previousPaddingRight
    }
  }, [open])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <div
        className="fixed inset-0 bg-black/50 transition-opacity"
        onClick={() => onOpenChange(false)}
      />
      <div
        style={{
          scrollbarWidth: 'thin',
          scrollbarColor: 'var(--border) transparent',
        }}
        className={cn(
          // Wide enough for the product form's two-column "label |
          // input" layout. Anything narrower forces the labels back
          // on top of the inputs which is what made the old dialog
          // feel cramped.
          'relative z-10 w-full max-w-3xl max-h-[90vh] overflow-y-auto rounded-t-xl sm:rounded-xl bg-card p-4 sm:p-6 shadow-lg sm:m-4 border border-border text-left',
          // Slim, rounded scrollbar so it follows the modal's rounded
          // corners instead of poking out with sharp square ends.
          // Firefox uses the style prop above; webkit needs explicit
          // pseudo-element styling.
          '[&::-webkit-scrollbar]:w-1.5',
          '[&::-webkit-scrollbar]:h-1.5',
          '[&::-webkit-scrollbar-track]:bg-transparent',
          '[&::-webkit-scrollbar-thumb]:rounded-full',
          '[&::-webkit-scrollbar-thumb]:bg-border',
          '[&::-webkit-scrollbar-thumb:hover]:bg-muted-foreground',
          className
        )}
      >
        {children}
      </div>
    </div>
  )
}

interface DialogContentProps {
  children: React.ReactNode
  className?: string
}

function DialogContent({ children, className }: DialogContentProps) {
  return <div className={cn('space-y-4', className)}>{children}</div>
}

interface DialogHeaderProps {
  children: React.ReactNode
  className?: string
}

function DialogHeader({ children, className }: DialogHeaderProps) {
  return <div className={cn('space-y-1.5', className)}>{children}</div>
}

interface DialogTitleProps {
  children: React.ReactNode
  className?: string
}

function DialogTitle({ children, className }: DialogTitleProps) {
  return (
    <h2 className={cn('text-lg font-semibold text-foreground text-left', className)}>
      {children}
    </h2>
  )
}

interface DialogDescriptionProps {
  children: React.ReactNode
  className?: string
}

function DialogDescription({ children, className }: DialogDescriptionProps) {
  return <p className={cn('text-sm text-muted-foreground text-left', className)}>{children}</p>
}

interface DialogCloseProps {
  onClick?: () => void
}

function DialogClose({ onClick }: DialogCloseProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="absolute right-2 top-2 inline-flex h-9 w-9 items-center justify-center rounded-sm opacity-70 ring-offset-card transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
    >
      <X className="h-4 w-4 text-muted-foreground" />
      <span className="sr-only">Close</span>
    </button>
  )
}

export { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogClose }
