// lib/client-credit.ts
// Unified client account model. A client's account works like a real bank
// account:
//
//   • money the client deposits (the wallet) is a POSITIVE balance
//   • unpaid invoices are credit we extend — an OVERDRAFT — and pull the
//     account NEGATIVE
//
// Net position = wallet deposits − outstanding invoices. The credit limit
// is the overdraft limit: how far negative the account may go. When the net
// position drops below −limit the ACCOUNT is flagged "Over limit" — a
// visual signal only; no invoice statuses change and nothing is blocked.

export interface CreditStatus {
  /** wallet deposits − outstanding invoices (negative = overdrawn). */
  net: number
  /** true when the net position is below −creditLimit. */
  overLimit: boolean
  /** How far past the overdraft limit the account is (£). 0 when within. */
  overBy: number
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100
}

/** Net account position: wallet deposits minus money still owed on invoices. */
export function getNetAccountBalance(accountBalance: number, outstanding: number): number {
  return roundMoney((accountBalance || 0) - (outstanding || 0))
}

export function getCreditStatus(
  accountBalance: number,
  outstanding: number,
  creditLimit: number | null | undefined
): CreditStatus {
  const net = getNetAccountBalance(accountBalance, outstanding)
  if (creditLimit == null || creditLimit <= 0) {
    return { net, overLimit: false, overBy: 0 }
  }
  // Over-limit = net position below the overdraft floor (−limit).
  const overBy = roundMoney(-creditLimit - net)
  return overBy > 0 ? { net, overLimit: true, overBy } : { net, overLimit: false, overBy: 0 }
}

/** System default payment terms used when the client has none set. */
export const DEFAULT_PAYMENT_TERMS_DAYS = 30
