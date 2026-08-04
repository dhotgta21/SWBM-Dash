import { describe, it, expect } from 'vitest'
import { volumeKeyAction } from './use-volume-key-controls'

describe('volumeKeyAction', () => {
  it('AudioVolumeUp when enabled -> start', () => {
    expect(volumeKeyAction('AudioVolumeUp', false, true)).toBe('start')
    expect(volumeKeyAction('AudioVolumeUp', true, true)).toBe('start')
  })

  it('AudioVolumeUp when disabled -> none', () => {
    expect(volumeKeyAction('AudioVolumeUp', false, false)).toBe('none')
  })

  it('AudioVolumeDown always -> stop (you can always hang up)', () => {
    expect(volumeKeyAction('AudioVolumeDown', false, true)).toBe('stop')
    expect(volumeKeyAction('AudioVolumeDown', true, false)).toBe('stop')
    expect(volumeKeyAction('AudioVolumeDown', false, false)).toBe('stop')
  })

  it('MediaPlayPause toggles based on listening state', () => {
    expect(volumeKeyAction('MediaPlayPause', true, true)).toBe('stop')
    expect(volumeKeyAction('MediaPlayPause', false, true)).toBe('start')
    // Hang-up always works.
    expect(volumeKeyAction('MediaPlayPause', true, false)).toBe('stop')
    // Pick-up respects enabled.
    expect(volumeKeyAction('MediaPlayPause', false, false)).toBe('none')
  })

  it('unrelated key codes are ignored', () => {
    expect(volumeKeyAction('KeyA', false, true)).toBe('none')
    expect(volumeKeyAction('Enter', true, true)).toBe('none')
    expect(volumeKeyAction('Space', false, true)).toBe('none')
  })

  it('empty code is ignored', () => {
    expect(volumeKeyAction('', false, true)).toBe('none')
  })
})
