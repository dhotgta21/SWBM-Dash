/**
 * Browser helpers for printing a generated invoice PDF via a hidden iframe.
 *
 * Why this exists:
 * - Chrome/Edge fire iframe `load` for blob PDFs before the built-in PDF
 *   viewer is ready. Calling `print()` immediately often yields a blank
 *   dialog or no dialog at all.
 * - Revoking the object URL too quickly (e.g. 1s after load) can cancel an
 *   in-progress print job.
 * - Some browsers never fire `load` for PDF blob iframes, so we need a
 *   fallback path that still attempts print after a short wait.
 */

/** Ensure the blob is typed as PDF so the browser opens its PDF viewer. */
export function createPdfObjectUrl(blob: Blob): string {
  const pdfBlob =
    blob.type === 'application/pdf' ? blob : new Blob([blob], { type: 'application/pdf' })
  return URL.createObjectURL(pdfBlob)
}

export type RunPdfIframePrintOptions = {
  /** Wait after load so the browser PDF plugin can initialize. Default 500ms. */
  readyDelayMs?: number
  /**
   * How long to keep the blob/iframe alive if `afterprint` never fires.
   * Default 60s — long enough for the user to confirm the print dialog.
   */
  cleanupTimeoutMs?: number
  /** Invoked once print() has been called (or failed before opening). */
  onPrinted?: () => void
  /** Invoked when it is safe to revoke the object URL and unmount the frame. */
  onCleanup?: () => void
  onError?: (error: unknown) => void
}

/**
 * Schedule print on a PDF iframe. Attach this *before* setting `iframe.src`
 * (or re-assign src after attaching) so the load listener is not missed.
 *
 * Returns a cancel function that stops timers and runs cleanup.
 */
export function runPdfIframePrint(
  iframe: HTMLIFrameElement,
  options: RunPdfIframePrintOptions = {}
): () => void {
  const readyDelayMs = options.readyDelayMs ?? 500
  const cleanupTimeoutMs = options.cleanupTimeoutMs ?? 60_000

  let cancelled = false
  let printed = false
  const timers: Array<ReturnType<typeof setTimeout>> = []

  const clearTimers = () => {
    for (const t of timers) clearTimeout(t)
    timers.length = 0
  }

  const finishCleanup = () => {
    if (cancelled) return
    cancelled = true
    clearTimers()
    try {
      iframe.contentWindow?.removeEventListener('afterprint', onAfterPrint)
    } catch {
      // cross-origin / torn-down frame
    }
    options.onCleanup?.()
  }

  const onAfterPrint = () => {
    // Brief grace period after the dialog closes before revoking the blob.
    timers.push(setTimeout(finishCleanup, 1_000))
  }

  const doPrint = () => {
    if (cancelled || printed) return
    printed = true

    const win = iframe.contentWindow
    if (!win) {
      options.onError?.(new Error('Print frame has no content window'))
      finishCleanup()
      return
    }

    try {
      win.addEventListener('afterprint', onAfterPrint)
      win.focus()
      win.print()
      options.onPrinted?.()
      // Fallback if afterprint never fires (common with some PDF plugins).
      timers.push(setTimeout(finishCleanup, cleanupTimeoutMs))
    } catch (err) {
      console.error('PDF print failed:', err)
      options.onError?.(err)
      finishCleanup()
    }
  }

  const schedulePrint = () => {
    timers.push(setTimeout(doPrint, readyDelayMs))
  }

  const onLoad = () => schedulePrint()
  iframe.addEventListener('load', onLoad)

  // Fallback when `load` never fires for blob PDFs.
  timers.push(
    setTimeout(() => {
      if (!printed && !cancelled) schedulePrint()
    }, readyDelayMs + 1_500)
  )

  return () => {
    iframe.removeEventListener('load', onLoad)
    if (!printed && !cancelled) {
      options.onError?.(new Error('Print cancelled'))
    }
    finishCleanup()
  }
}

/**
 * Imperatively mount a hidden iframe, load the PDF blob URL, wait for the
 * viewer, then open the browser print dialog. Cleans up the iframe and
 * revokes the object URL when printing is done (or times out).
 */
export function printPdfBlob(blob: Blob, options: Omit<RunPdfIframePrintOptions, 'onCleanup'> = {}): {
  cancel: () => void
  objectUrl: string
} {
  const objectUrl = createPdfObjectUrl(blob)
  const iframe = document.createElement('iframe')
  iframe.setAttribute('title', 'Print document')
  iframe.setAttribute('aria-hidden', 'true')
  Object.assign(iframe.style, {
    position: 'fixed',
    right: '0',
    bottom: '0',
    width: '0',
    height: '0',
    border: '0',
    opacity: '0',
    pointerEvents: 'none',
  })

  document.body.appendChild(iframe)

  let cleaned = false
  const destroy = () => {
    if (cleaned) return
    cleaned = true
    iframe.remove()
    URL.revokeObjectURL(objectUrl)
  }

  const cancelPrint = runPdfIframePrint(iframe, {
    ...options,
    onCleanup: destroy,
  })

  // Assign src after listeners are attached so we never miss `load`.
  iframe.src = objectUrl

  return {
    objectUrl,
    cancel: () => {
      cancelPrint()
      destroy()
    },
  }
}
