import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createPdfObjectUrl, runPdfIframePrint } from './print-pdf-browser'

function makeIframeMock(contentWindow: {
  print: ReturnType<typeof vi.fn>
  focus: ReturnType<typeof vi.fn>
  addEventListener: ReturnType<typeof vi.fn>
  removeEventListener: ReturnType<typeof vi.fn>
}) {
  const listeners = new Map<string, Set<EventListener>>()
  return {
    contentWindow,
    addEventListener(type: string, listener: EventListener) {
      if (!listeners.has(type)) listeners.set(type, new Set())
      listeners.get(type)!.add(listener)
    },
    removeEventListener(type: string, listener: EventListener) {
      listeners.get(type)?.delete(listener)
    },
    dispatchEvent(event: { type: string }) {
      for (const listener of listeners.get(event.type) ?? []) {
        listener(event as unknown as Event)
      }
      return true
    },
  } as unknown as HTMLIFrameElement
}

describe('createPdfObjectUrl', () => {
  it('preserves application/pdf blobs', () => {
    const blob = new Blob(['%PDF-1.4'], { type: 'application/pdf' })
    const url = createPdfObjectUrl(blob)
    expect(url).toMatch(/^blob:/)
    URL.revokeObjectURL(url)
  })

  it('re-types non-pdf blobs as application/pdf', () => {
    const createObjectURL = vi.spyOn(URL, 'createObjectURL')
    const blob = new Blob(['%PDF-1.4'], { type: '' })
    createPdfObjectUrl(blob)
    expect(createObjectURL).toHaveBeenCalled()
    const arg = createObjectURL.mock.calls[0][0] as Blob
    expect(arg.type).toBe('application/pdf')
    createObjectURL.mockRestore()
  })
})

describe('runPdfIframePrint', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('waits for ready delay after load before calling print', () => {
    const print = vi.fn()
    const focus = vi.fn()
    const addEventListener = vi.fn()
    const removeEventListener = vi.fn()
    const iframe = makeIframeMock({ print, focus, addEventListener, removeEventListener })

    const onPrinted = vi.fn()
    runPdfIframePrint(iframe, { readyDelayMs: 500, onPrinted })

    iframe.dispatchEvent({ type: 'load' } as Event)
    expect(print).not.toHaveBeenCalled()

    vi.advanceTimersByTime(499)
    expect(print).not.toHaveBeenCalled()

    vi.advanceTimersByTime(1)
    expect(print).toHaveBeenCalledTimes(1)
    expect(onPrinted).toHaveBeenCalledTimes(1)
  })

  it('falls back when load never fires', () => {
    const print = vi.fn()
    const focus = vi.fn()
    const addEventListener = vi.fn()
    const removeEventListener = vi.fn()
    const iframe = makeIframeMock({ print, focus, addEventListener, removeEventListener })

    const onPrinted = vi.fn()
    runPdfIframePrint(iframe, { readyDelayMs: 500, onPrinted })

    // Fallback schedules at readyDelay + 1500, then waits readyDelay again.
    vi.advanceTimersByTime(500 + 1500 + 500)
    expect(print).toHaveBeenCalledTimes(1)
    expect(onPrinted).toHaveBeenCalledTimes(1)
  })
})
