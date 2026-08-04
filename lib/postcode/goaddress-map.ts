/**
 * Pure GoAddress helpers (no 'use server').
 * Must live outside lib/actions/postcode.ts so Next.js does not treat
 * sync exports as Server Actions (which must be async).
 */

export interface AddressSuggestion {
  label: string
  line_1: string
  line_2: string
  town: string
  county: string
  postcode: string
}

export interface PostcodeLookupResult {
  postcode: string
  town: string
  county: string
  suggestions?: AddressSuggestion[]
  /** Which provider produced this result (for UI / debugging). */
  provider?: 'goaddress' | 'postcodes.io'
  /**
   * Non-fatal notice when the free fallback ran (or GoAddress had no list).
   * UI shows this as an amber hint while still allowing manual entry.
   */
  softError?: string
}

/** Operators often paste "Bearer xyz" from docs; the API only wants xyz. */
export function normalizeGoAddressToken(raw: string): string {
  return raw.trim().replace(/^Bearer\s+/i, '').trim()
}

export function isPlaceholderToken(token: string): boolean {
  const t = normalizeGoAddressToken(token)
  if (!t) return true
  // .env.example / local defaults that must never be sent to the API.
  if (/replace|your.?token|changeme|example|todo|\.\.\./i.test(t)) return true
  if (t === '...' || t === 'replace-me') return true
  return false
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function stringField(obj: Record<string, unknown>, ...keys: string[]): string {
  for (const key of keys) {
    const v = obj[key]
    if (v != null && String(v).trim()) return String(v).trim()
  }
  return ''
}

/**
 * Map a GoAddress JSON body into address suggestions.
 * Official shape: results (label objects), new_address_res (structured),
 * new_address_res2 (line_1..line_4). Older code wrongly required `addresses`.
 */
export function mapGoAddressPayload(
  data: unknown,
  postcode: string
): PostcodeLookupResult | { error: string } {
  const root = asRecord(data)
  if (!root) {
    return { error: 'Unexpected GoAddress response.' }
  }

  const addressInfo = asRecord(root.address_info) ?? {}

  const structuredRows: Record<string, unknown>[] = Array.isArray(root.new_address_res)
    ? root.new_address_res.map(asRecord).filter((r): r is Record<string, unknown> => r !== null)
    : []

  const lineRows: Record<string, unknown>[] = Array.isArray(root.new_address_res2)
    ? root.new_address_res2.map(asRecord).filter((r): r is Record<string, unknown> => r !== null)
    : []

  // Docs: results is an array of { addressid, address, postcode, label }.
  const resultRows: Record<string, unknown>[] = Array.isArray(root.results)
    ? root.results
        .map((r) => {
          if (typeof r === 'string' && r.trim()) {
            return { label: r.trim(), raw_address: r.trim() }
          }
          const obj = asRecord(r)
          if (!obj) return null
          return obj
        })
        .filter((r): r is Record<string, unknown> => r !== null)
    : []

  const lineById = new Map<string, Record<string, unknown>>()
  for (const row of lineRows) {
    const id = stringField(row, 'addressid', 'address_id', 'id')
    if (id) lineById.set(id, row)
  }

  const primaryRows =
    structuredRows.length > 0
      ? structuredRows
      : lineRows.length > 0
        ? lineRows
        : resultRows

  if (primaryRows.length === 0) {
    return { error: 'No addresses found for this postcode.' }
  }

  const defaultTown = stringField(addressInfo, 'post_town', 'town', 'city')
  const defaultCounty = stringField(addressInfo, 'county', 'region', 'district')

  const suggestions: AddressSuggestion[] = primaryRows.map((addr) => {
    const id = stringField(addr, 'addressid', 'address_id', 'id')
    const lines = id ? lineById.get(id) : undefined

    const line1FromStruct =
      stringField(addr, 'line_1', 'line1') ||
      (lines ? stringField(lines, 'line_1', 'line1') : '')
    const line2FromStruct =
      stringField(addr, 'line_2', 'line2') ||
      (lines ? stringField(lines, 'line_2', 'line2') : '')

    const raw =
      stringField(addr, 'raw_address', 'label', 'address') ||
      [line1FromStruct, line2FromStruct].filter(Boolean).join(', ')

    const town =
      stringField(addr, 'post_town', 'town', 'city') ||
      (lines ? stringField(lines, 'line_3') : '') ||
      defaultTown
    const county =
      stringField(addr, 'county', 'region', 'district') ||
      (lines ? stringField(lines, 'line_4') : '') ||
      defaultCounty

    if (line1FromStruct || line2FromStruct) {
      const line1 = line1FromStruct || raw
      const line2 = line2FromStruct
      return {
        label: raw || [line1, line2, town, postcode].filter(Boolean).join(', '),
        line_1: line1,
        line_2: line2,
        town,
        county,
        postcode: stringField(addr, 'postcode') || postcode,
      }
    }

    if (raw) {
      return {
        label: [raw, town, postcode].filter(Boolean).join(', '),
        line_1: raw,
        line_2: '',
        town,
        county,
        postcode: stringField(addr, 'postcode') || postcode,
      }
    }

    const buildingName = stringField(addr, 'building_name', 'organisation')
    const houseNo = stringField(addr, 'houseNo', 'house_no', 'flat')
    const street = stringField(addr, 'street', 'road')
    const road = stringField(addr, 'road')

    const line1Parts: string[] = []
    if (buildingName) line1Parts.push(buildingName)
    if (houseNo && !street.toLowerCase().startsWith(houseNo.toLowerCase())) {
      line1Parts.push(houseNo)
    }
    if (street) line1Parts.push(street)

    const line2 =
      road && road.toLowerCase() !== street.toLowerCase() ? road : ''
    const line1 = line1Parts.join(' ').trim()

    return {
      label: [line1, line2, town, postcode].filter(Boolean).join(', ') || 'Address',
      line_1: line1,
      line_2: line2,
      town,
      county,
      postcode: stringField(addr, 'postcode') || postcode,
    }
  })

  return {
    postcode,
    town: defaultTown,
    county: defaultCounty,
    suggestions,
    provider: 'goaddress',
  }
}
