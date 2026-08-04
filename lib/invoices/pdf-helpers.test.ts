import { describe, it, expect } from 'vitest'
import { buildHeaderContactGrid, buildHeaderContactBlocks } from './pdf-helpers'
import type { CompanyContactChannel } from '@/lib/company'

function phone(value: string, label: string | null = null): CompanyContactChannel {
  return {
    id: value,
    value,
    label,
    isPrimary: false,
    contexts: {
      header: true,
      homepage: true,
      contactPage: true,
      footer: true,
      invoice: true,
      email: true,
      auth: true,
    },
    sortOrder: 0,
  }
}

function email(value: string, label: string | null = null): CompanyContactChannel {
  return {
    id: value,
    value,
    label,
    isPrimary: false,
    contexts: {
      header: true,
      homepage: true,
      contactPage: true,
      footer: true,
      invoice: true,
      email: true,
      auth: true,
    },
    sortOrder: 0,
  }
}

describe('buildHeaderContactGrid', () => {
  it('returns an empty array when both sides are empty', () => {
    expect(buildHeaderContactGrid([], [])).toEqual([])
  })

  it('pairs phones with emails row-by-row when counts match', () => {
    const phones = [phone('P1'), phone('P2'), phone('P3'), phone('P4')]
    const emails = [email('e1@x'), email('e2@x'), email('e3@x'), email('e4@x')]
    const grid = buildHeaderContactGrid(phones, emails)
    expect(grid).toEqual([
      { phone: phones[0], email: emails[0] },
      { phone: phones[1], email: emails[1] },
      { phone: phones[2], email: emails[2] },
      { phone: phones[3], email: emails[3] },
    ])
  })

  it('fills missing phone cells with undefined when emails outnumber phones', () => {
    const phones = [phone('P1'), phone('P2')]
    const emails = [
      email('e1@x'),
      email('e2@x'),
      email('e3@x'),
      email('e4@x'),
    ]
    const grid = buildHeaderContactGrid(phones, emails)
    expect(grid).toEqual([
      { phone: phones[0], email: emails[0] },
      { phone: phones[1], email: emails[1] },
      { phone: undefined, email: emails[2] },
      { phone: undefined, email: emails[3] },
    ])
  })

  it('fills missing email cells with undefined when phones outnumber emails', () => {
    const phones = [
      phone('P1'),
      phone('P2'),
      phone('P3'),
      phone('P4'),
    ]
    const emails = [email('e1@x'), email('e2@x')]
    const grid = buildHeaderContactGrid(phones, emails)
    expect(grid).toEqual([
      { phone: phones[0], email: emails[0] },
      { phone: phones[1], email: emails[1] },
      { phone: phones[2], email: undefined },
      { phone: phones[3], email: undefined },
    ])
  })

  it('emits a single row when only one side has one entry', () => {
    const phones = [phone('P1')]
    const emails = [email('e1@x')]
    expect(buildHeaderContactGrid(phones, emails)).toEqual([
      { phone: phones[0], email: emails[0] },
    ])
  })

  it('emits a single column when the other side is empty', () => {
    const phones = [phone('P1'), phone('P2'), phone('P3'), phone('P4')]
    expect(buildHeaderContactGrid(phones, [])).toEqual([
      { phone: phones[0], email: undefined },
      { phone: phones[1], email: undefined },
      { phone: phones[2], email: undefined },
      { phone: phones[3], email: undefined },
    ])
    const emails = [email('e1@x'), email('e2@x'), email('e3@x'), email('e4@x')]
    expect(buildHeaderContactGrid([], emails)).toEqual([
      { phone: undefined, email: emails[0] },
      { phone: undefined, email: emails[1] },
      { phone: undefined, email: emails[2] },
      { phone: undefined, email: emails[3] },
    ])
  })

  it('preserves channel label on the grid row (used as the link title attribute)', () => {
    const phones = [phone('P1', 'Trade counter')]
    const emails = [email('e1@x', 'Sales')]
    const grid = buildHeaderContactGrid(phones, emails)
    expect(grid[0].phone?.label).toBe('Trade counter')
    expect(grid[0].email?.label).toBe('Sales')
  })
})

describe('buildHeaderContactBlocks', () => {
  it('returns an empty array when both sides are empty', () => {
    expect(buildHeaderContactBlocks([], [])).toEqual([])
  })

  it('groups phones in 2×2 rows then emails in 2×2 rows', () => {
    const phones = [phone('P1'), phone('P2'), phone('P3'), phone('P4')]
    const emails = [email('e1@x'), email('e2@x'), email('e3@x'), email('e4@x')]
    const rows = buildHeaderContactBlocks(phones, emails)
    expect(rows).toEqual([
      [
        { type: 'phone', channel: phones[0] },
        { type: 'phone', channel: phones[1] },
      ],
      [
        { type: 'phone', channel: phones[2] },
        { type: 'phone', channel: phones[3] },
      ],
      [
        { type: 'email', channel: emails[0] },
        { type: 'email', channel: emails[1] },
      ],
      [
        { type: 'email', channel: emails[2] },
        { type: 'email', channel: emails[3] },
      ],
    ])
  })

  it('always reserves four rows so the layout stays stable as contacts are added', () => {
    const phones = [phone('P1'), phone('P2'), phone('P3')]
    const emails = [email('e1@x')]
    const rows = buildHeaderContactBlocks(phones, emails)
    expect(rows).toEqual([
      [{ type: 'phone', channel: phones[0] }, { type: 'phone', channel: phones[1] }],
      [{ type: 'phone', channel: phones[2] }, { type: 'phone', channel: undefined }],
      [{ type: 'email', channel: emails[0] }, { type: 'email', channel: undefined }],
      [{ type: 'email', channel: undefined }, { type: 'email', channel: undefined }],
    ])
  })

  it('keeps blank email rows when only phones are provided', () => {
    const phones = [phone('P1'), phone('P2')]
    const rows = buildHeaderContactBlocks(phones, [])
    expect(rows).toEqual([
      [{ type: 'phone', channel: phones[0] }, { type: 'phone', channel: phones[1] }],
      [{ type: 'phone', channel: undefined }, { type: 'phone', channel: undefined }],
      [{ type: 'email', channel: undefined }, { type: 'email', channel: undefined }],
      [{ type: 'email', channel: undefined }, { type: 'email', channel: undefined }],
    ])
  })

  it('caps each contact type at four entries', () => {
    const phones = [phone('P1'), phone('P2'), phone('P3'), phone('P4'), phone('P5')]
    const emails = [email('e1@x'), email('e2@x'), email('e3@x'), email('e4@x'), email('e5@x')]
    const rows = buildHeaderContactBlocks(phones, emails)
    expect(rows).toHaveLength(4)
    const phoneRows = rows.slice(0, 2)
    const emailRows = rows.slice(2, 4)
    expect(phoneRows.flat().every((c) => c.type === 'phone')).toBe(true)
    expect(emailRows.flat().every((c) => c.type === 'email')).toBe(true)
    expect(phoneRows.flat().map((c) => c.channel?.value)).toEqual(['P1', 'P2', 'P3', 'P4'])
    expect(emailRows.flat().map((c) => c.channel?.value)).toEqual(['e1@x', 'e2@x', 'e3@x', 'e4@x'])
  })
})
