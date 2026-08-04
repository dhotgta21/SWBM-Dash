import { describe, expect, it } from 'vitest'
import { mapGoAddressPayload } from '@/lib/postcode/goaddress-map'

/** Official docs sample (https://goaddress.io/docs.html) truncated. */
const DOCS_SAMPLE = {
  query: 'AB422UB',
  count: 2,
  results: [
    {
      addressid: 'eb4e61a6',
      address: '1 Viking Way',
      postcode: 'AB422UB',
      label: '1 Viking Way, AB422UB',
    },
    {
      addressid: '2864053d',
      address: '10 Viking Way',
      postcode: 'AB422UB',
      label: '10 Viking Way, AB422UB',
    },
  ],
  new_address_res: [
    {
      flat: null,
      houseNo: '1',
      building_name: '',
      organisation: '',
      street: 'Viking Way',
      addressid: 'eb4e61a6',
      raw_address: '1 Viking Way',
      postcode: 'AB422UB',
      post_town: 'Peterhead',
      city: 'Aberdeenshire',
      town: 'Peterhead',
      county: 'Aberdeenshire',
      district: 'Aberdeenshire',
      region: '',
      country: 'Scotland',
    },
    {
      flat: null,
      houseNo: '10',
      building_name: '',
      organisation: '',
      street: 'Viking Way',
      addressid: '2864053d',
      raw_address: '10 Viking Way',
      postcode: 'AB422UB',
      post_town: 'Peterhead',
      city: 'Aberdeenshire',
      town: 'Peterhead',
      county: 'Aberdeenshire',
      district: 'Aberdeenshire',
      region: '',
      country: 'Scotland',
    },
  ],
  new_address_res2: [
    {
      addressid: 'eb4e61a6',
      line_1: '1 Viking Way',
      line_2: 'Aberdeenshire',
      line_3: 'AB422UB',
      line_4: 'Scotland',
    },
  ],
  address_info: {
    postcode: 'AB422UB',
    post_town: 'Peterhead',
    city: 'Aberdeenshire',
    town: 'Hatton',
    county: 'Aberdeenshire',
    district: 'Aberdeenshire',
    region: '',
    country: 'Scotland',
  },
  usage_today: 4,
  daily_limit: 200,
  remaining_today: 196,
}

describe('mapGoAddressPayload', () => {
  it('maps official docs sample into suggestions (no addresses field)', () => {
    const result = mapGoAddressPayload(DOCS_SAMPLE, 'AB42 2UB')
    expect('error' in result).toBe(false)
    if ('error' in result) return
    expect(result.suggestions?.length).toBe(2)
    expect(result.suggestions?.[0].line_1).toContain('Viking')
    expect(result.suggestions?.[0].town).toBeTruthy()
    expect(result.provider).toBe('goaddress')
  })

  it('does not require a non-existent addresses array', () => {
    const withoutAddresses = { ...DOCS_SAMPLE }
    // @ts-expect-error intentional: confirm missing addresses is fine
    delete withoutAddresses.addresses
    const result = mapGoAddressPayload(withoutAddresses, 'AB42 2UB')
    expect('error' in result).toBe(false)
  })

  it('falls back to results objects when structured arrays missing', () => {
    const result = mapGoAddressPayload(
      {
        results: [
          {
            addressid: 'x',
            address: '9 High Street',
            postcode: 'SL1 1AA',
            label: '9 High Street, SL1 1AA',
          },
        ],
      },
      'SL1 1AA'
    )
    expect('error' in result).toBe(false)
    if ('error' in result) return
    expect(result.suggestions?.[0].line_1).toContain('High Street')
  })

  it('returns error when completely empty', () => {
    const result = mapGoAddressPayload({}, 'HA3 7HZ')
    expect(result).toEqual({ error: 'No addresses found for this postcode.' })
  })

  it('never turns result objects into [object Object]', () => {
    const result = mapGoAddressPayload(
      {
        results: [{ label: '1 Test Lane, HA3 7HZ', address: '1 Test Lane' }],
      },
      'HA3 7HZ'
    )
    if ('error' in result) throw new Error('expected success')
    expect(result.suggestions?.[0].label).not.toContain('[object Object]')
  })
})
