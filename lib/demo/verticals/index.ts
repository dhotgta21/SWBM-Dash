export type { DemoVerticalId, DemoVerticalPack } from './types'
export { VERTICAL_PACKS, VERTICAL_IDS, getVerticalPack } from './packs'
import { getDemoVertical } from '@/lib/demo/brand'
import { getVerticalPack } from './packs'
import type { DemoVerticalPack } from './types'

/** Active vertical for this process (env-driven). */
export function getActiveVerticalPack(): DemoVerticalPack {
  return getVerticalPack(getDemoVertical())
}
