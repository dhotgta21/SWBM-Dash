'use server'

import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { isAdminUser } from '@/lib/supabase/access'
import { resolveStaffPermissions } from '@/lib/auth/permissions'
import { rateLimit } from '@/lib/rate-limit'
import { isLikelyValidEmail } from '@/lib/utils'
import { callDeepSeek } from '@/lib/ai/deepseek'
import { assistantTools } from '@/lib/ai/invoice-assistant/tools'
import { buildSystemPrompt } from '@/lib/ai/invoice-assistant/prompts'
import {
  emptyDraft,
  addLineItem,
  updateLineItem,
  removeLineItem,
  setDeliveryAddress,
  setPendingItem,
  clearPendingItem,
  clientDisplayName,
  formatDraftItems,
  formatDraftTotals,
} from '@/lib/ai/invoice-assistant/draft'
import { sanitizePromptText, sanitizeUserUtterance } from '@/lib/ai/invoice-assistant/sanitize'
import {
  type AssistantDraft,
  type AssistantLineItem,
  type AssistantState,
  type AssistantMessage,
  type AssistantStepInput,
  type AssistantStepResult,
  type ClientAction,
  type DeepSeekMessage,
  type DeepSeekToolCall,
} from '@/lib/ai/invoice-assistant/types'
import { searchClients, createInvoice } from './invoices'
import { createClientRecord } from './clients'
import { searchPublicProductsSmart } from './public-products'
import { buildWhatsAppShareText } from '@/lib/email/whatsapp-message'
import { buildInvoiceShareUrl } from '@/lib/share/invoice-url'
import { getCompanyDefaultVatRate } from '@/lib/company-vat'

// ─────────────────────────────────────────────────────────────────────────────
// Input validation
// ─────────────────────────────────────────────────────────────────────────────

const toolCallSchema = z.object({
  id: z.string(),
  type: z.literal('function'),
  function: z.object({
    name: z.string(),
    arguments: z.string(),
  }),
})

const assistantMessageSchema = z.object({
  role: z.enum(['user', 'assistant', 'tool']),
  content: z.string().max(2000),
  tool_call_id: z.string().optional(),
  name: z.string().optional(),
  tool_calls: z.array(toolCallSchema).optional(),
})

const stepInputSchema = z.object({
  messages: z.array(assistantMessageSchema).max(50),
  draft: z.object({
    type: z.enum(['invoice', 'quotation']),
    client: z
      .union([
        z.object({
          id: z.string(),
          first_name: z.string().nullable(),
          last_name: z.string().nullable(),
          company_name: z.string().nullable(),
          email: z.string().nullable(),
          phone: z.string().nullable(),
        }),
        z.object({
          first_name: z.string(),
          last_name: z.string(),
          phone: z.string().optional(),
          email: z.string().optional(),
          company_name: z.string().optional(),
        }),
      ])
      .nullable()
      .optional(),
    items: z
      .array(
        z.object({
          product_id: z.string().nullable().optional(),
          product_code: z.string().optional(),
          product_name: z.string(),
          unit: z.string().optional(),
          quantity: z.number(),
          price: z.number(),
          vat_rate: z.number().optional(),
          vat_amount: z.number().optional(),
          line_total: z.number().optional(),
        })
      )
      .max(50, 'Draft cannot contain more than 50 items.'),
    pendingItem: z
      .object({
        product_id: z.string().nullable().optional(),
        product_code: z.string().optional(),
        product_name: z.string().optional(),
        unit: z.string().optional(),
        quantity: z.number().optional(),
        price: z.number().optional(),
      })
      .nullable()
      .optional(),
    apply_vat: z.boolean(),
    vat_rate_percent: z.number().min(0).max(100).optional(),
    subtotal: z.number().optional(),
    vat_total: z.number().optional(),
    total: z.number().optional(),
    deliveryAddress: z
      .object({
        line_1: z.string().optional(),
        line_2: z.string().optional(),
        town: z.string().optional(),
        county: z.string().optional(),
        postcode: z.string().optional(),
      })
      .nullable()
      .optional(),
    createdInvoiceId: z.string().optional(),
    createdInvoice: z.record(z.unknown()).optional(),
  }),
  state: z.enum([
    'awaiting_client',
    'awaiting_items',
    'awaiting_delivery_address',
    'confirming',
    'created',
    'done',
  ]),
})

// ─────────────────────────────────────────────────────────────────────────────
// Message history validation
// ─────────────────────────────────────────────────────────────────────────────

function sanitizeMessages(messages: AssistantMessage[]): AssistantMessage[] {
  return messages.map((m) => {
    // User-spoken transcripts are stricter than tool outputs and assistant
    // prose — strip script tags, inject-pattern defanging, and shorter
    // length cap. Tool / assistant messages use the general helper.
    if (m.role === 'user') {
      return { ...m, content: sanitizeUserUtterance(m.content, 1500) }
    }
    return { ...m, content: sanitizePromptText(m.content, 2000) }
  })
}

function validateMessageHistory(messages: AssistantMessage[]): string | null {
  if (messages.length === 0) return 'No messages provided.'
  const last = messages[messages.length - 1]
  if (last.role !== 'user') return 'Last message must be from the user.'

  for (const m of messages) {
    if (m.role === 'tool' && (!m.tool_call_id || !m.name)) {
      return 'Invalid tool message in history.'
    }
  }
  return null
}

/**
 * Count create_new_client tool calls in the message history. Used to
 * enforce a per-session cap so a runaway loop or a malicious payload can
 * never bulk-create dozens of incomplete client records.
 */
function countClientCreatesInHistory(messages: AssistantMessage[]): number {
  let count = 0
  for (const m of messages) {
    if (m.role === 'tool' && m.name === 'create_new_client') {
      const ok = typeof m.content === 'string' && m.content.includes('"success":true')
      if (ok) count += 1
    }
  }
  return count
}

// ─────────────────────────────────────────────────────────────────────────────
// Tool argument schemas
// ─────────────────────────────────────────────────────────────────────────────

const argsSchemas = {
  search_clients: z.object({ query: z.string() }),
  select_client: z.object({ client_id: z.string().uuid() }),
  create_new_client: z.object({
    first_name: z.string(),
    last_name: z.string(),
    company_name: z.string().optional(),
  }),
  search_products: z.object({ query: z.string() }),
  prepare_line_item: z.object({
    product_id: z.string().optional(),
    product_code: z.string().optional(),
    product_name: z.string().optional(),
    unit: z.string().optional(),
    quantity: z.number().optional(),
    price: z.number().optional(),
  }),
  add_line_item: z.object({
    product_id: z.string().optional(),
    product_code: z.string().optional(),
    product_name: z.string(),
    unit: z.string().optional(),
    quantity: z.number(),
    price: z.number(),
  }),
  update_line_item: z.object({
    index: z.number(),
    product_name: z.string().optional(),
    quantity: z.number().optional(),
    price: z.number().optional(),
    unit: z.string().optional(),
  }),
  remove_line_item: z.object({ index: z.number() }),
  set_delivery_address: z.object({
    line_1: z.string(),
    line_2: z.string().optional(),
    town: z.string().optional(),
    county: z.string().optional(),
    postcode: z.string().optional(),
  }),
  send_email: z.object({ recipient: z.string().optional() }),
}

// ─────────────────────────────────────────────────────────────────────────────
// Main server action
// ─────────────────────────────────────────────────────────────────────────────

export async function runInvoiceAssistantStep(input: AssistantStepInput): Promise<AssistantStepResult> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { ...makeResult(input), error: 'Not authenticated' }
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, permissions')
    .eq('id', user.id)
    .maybeSingle()

  if (!profile) {
    return { ...makeResult(input), error: 'Not authorised' }
  }

  const isAdmin = await isAdminUser(supabase, user.id)
  const perms = resolveStaffPermissions(profile.role, profile.permissions)
  if (!isAdmin && !perms.invoices_add) {
    return { ...makeResult(input), error: 'Your account is not allowed to create documents. Ask an administrator.' }
  }

  const limit = await rateLimit(supabase, `assistant:${user.id}`, 60, 60_000, { failOpen: false })
  if (!limit.allowed) {
    return { ...makeResult(input), error: 'Too many messages. Please slow down.' }
  }

  const parsed = stepInputSchema.safeParse(input)
  if (!parsed.success) {
    return { ...makeResult(input), error: 'Invalid assistant state. Please refresh.' }
  }

  const { messages, draft: rawDraft, state } = parsed.data
  const companyVatRate = await getCompanyDefaultVatRate()
  const draft = normaliseDraft(rawDraft, companyVatRate)

  const historyError = validateMessageHistory(messages)
  if (historyError) {
    return { ...makeResult({ messages, draft, state }), error: historyError }
  }
  const sanitizedMessages = sanitizeMessages(messages)

  try {
    const result = await runAgentTurn({
      userId: user.id,
      isAdmin,
      perms,
      messages: sanitizedMessages,
      draft,
      state,
    })
    return result
  } catch (err) {
    console.error('[invoice-assistant] agent turn failed:', err)
    return {
      ...makeResult({ messages, draft, state }),
      error: err instanceof Error ? err.message : 'Assistant failed. Please try again.',
    }
  }
}

function makeResult(input: AssistantStepInput): AssistantStepResult {
  return {
    messages: input.messages,
    draft: sanitizeDraftForClient(input.draft),
    state: input.state,
    assistantMessage: '',
  }
}

// Strip contact details from the client record and invoice row before sending
// the draft back to the browser. The UI only needs names/company for display.
function sanitizeDraftForClient(draft: AssistantDraft): AssistantDraft {
  // Keep the full client record for the UI (it needs email/phone to decide
  // which post-invoice actions to offer). The LLM never sees this object;
  // it only sees the display name via formatDraftClient and filtered tool results.
  const rawInvoice = draft.createdInvoice
  const createdInvoice = rawInvoice
    ? {
        id: rawInvoice.id,
        document_number: rawInvoice.document_number,
        share_token: rawInvoice.share_token,
      }
    : undefined

  return {
    ...draft,
    createdInvoice,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Agent turn loop
// ─────────────────────────────────────────────────────────────────────────────

interface TurnContext {
  userId: string
  isAdmin: boolean
  perms: ReturnType<typeof resolveStaffPermissions>
}

async function runAgentTurn(
  ctx: TurnContext & { messages: AssistantMessage[]; draft: AssistantDraft; state: AssistantState }
): Promise<AssistantStepResult> {
  let messages: AssistantMessage[] = [...ctx.messages]
  // Draft is already normalised by the caller with the company VAT rate.
  let draft: AssistantDraft = ctx.draft
  let state: AssistantState = ctx.state
  let clientActions: ClientAction[] = []
  const { userId, isAdmin, perms } = ctx

  const systemPrompt = buildSystemPrompt(state, draft)
  const initialApiMessages: DeepSeekMessage[] = [
    { role: 'system', content: systemPrompt },
    ...messages,
  ]

  const firstResponse = await callDeepSeek({ messages: initialApiMessages, tools: assistantTools })
  const firstChoice = firstResponse.choices[0]
  if (!firstChoice) {
    throw new Error('No response from assistant')
  }

  const firstAssistant = firstChoice.message
  messages.push({
    role: 'assistant',
    content: (firstAssistant.content as string) || '',
    tool_calls: firstAssistant.tool_calls,
  })

  // Execute tool calls if any, up to a safety limit.
  let currentAssistant = firstAssistant
  let rounds = 0
  const maxRounds = 4
  while (currentAssistant.tool_calls && currentAssistant.tool_calls.length > 0 && rounds < maxRounds) {
    rounds++
    const toolRound = await executeToolCalls({
      userId,
      isAdmin,
      perms,
      toolCalls: currentAssistant.tool_calls,
      draft,
      state,
      messages,
      clientActions,
    })

    draft = toolRound.draft
    state = toolRound.state
    messages = toolRound.messages
    clientActions = toolRound.clientActions

    // Re-call the model with the updated state so it can react to the tool results.
    const nextResponse = await callDeepSeek({
      messages: [{ role: 'system', content: buildSystemPrompt(state, draft) }, ...messages],
      tools: assistantTools,
    })
    const nextChoice = nextResponse.choices[0]
    if (!nextChoice) break

    currentAssistant = nextChoice.message
    messages.push({
      role: 'assistant',
      content: (currentAssistant.content as string) || '',
      tool_calls: currentAssistant.tool_calls,
    })

    if (!currentAssistant.tool_calls || currentAssistant.tool_calls.length === 0) {
      return {
        messages,
        draft: sanitizeDraftForClient(draft),
        state,
        assistantMessage: (currentAssistant.content as string) || 'Done.',
        clientActions,
      }
    }
  }

  // No tool calls (or safety limit reached): return the current assistant message.
  return {
    messages,
    draft: sanitizeDraftForClient(draft),
    state,
    assistantMessage: (currentAssistant.content as string) || 'How can I help?',
    clientActions,
  }
}

type RawAssistantDraft = z.infer<typeof stepInputSchema>['draft']

function normaliseDraft(
  raw: AssistantDraft | RawAssistantDraft,
  companyVatRate = 20
): AssistantDraft {
  // Ensure totals are always present and items have VAT fields.
  let result = emptyDraft(raw.type)
  result.client = raw.client ?? null
  result.pendingItem = raw.pendingItem ?? null
  result.apply_vat = raw.apply_vat
  result.vat_rate_percent =
    (raw as AssistantDraft).vat_rate_percent != null
      ? Number((raw as AssistantDraft).vat_rate_percent)
      : companyVatRate
  result.deliveryAddress = raw.deliveryAddress ?? null
  result.createdInvoiceId = raw.createdInvoiceId
  result.createdInvoice = raw.createdInvoice

  const rate = result.vat_rate_percent ?? companyVatRate
  const items: AssistantLineItem[] = raw.items.map((item) => ({
    product_id: item.product_id ?? null,
    product_code: item.product_code ?? null,
    product_name: item.product_name,
    unit: item.unit?.trim() || 'EA',
    quantity: item.quantity,
    price: item.price,
    vat_rate: raw.apply_vat ? rate : 0,
  }))

  if (items.length > 0) {
    result = items.reduce(
      (acc, item) =>
        addLineItem(acc, {
          product_id: item.product_id,
          product_code: item.product_code,
          product_name: item.product_name,
          unit: item.unit,
          quantity: item.quantity,
          price: item.price,
        }),
      result
    )
  }
  return result
}

// ─────────────────────────────────────────────────────────────────────────────
// Tool execution
// ─────────────────────────────────────────────────────────────────────────────

interface ToolRoundInput {
  userId: string
  isAdmin: boolean
  perms: ReturnType<typeof resolveStaffPermissions>
  toolCalls: DeepSeekToolCall[]
  draft: AssistantDraft
  state: AssistantState
  messages: AssistantMessage[]
  clientActions: ClientAction[]
}

interface ToolRoundOutput {
  draft: AssistantDraft
  state: AssistantState
  messages: AssistantMessage[]
  clientActions: ClientAction[]
}

async function executeToolCalls(input: ToolRoundInput): Promise<ToolRoundOutput> {
  const { toolCalls, draft, state, messages, clientActions, userId, isAdmin, perms } = input
  const result: ToolRoundOutput = { draft, state, messages: [...messages], clientActions: [...clientActions] }

  for (const toolCall of toolCalls) {
    const name = toolCall.function.name
    let content = ''

    try {
      const rawArgs = JSON.parse(toolCall.function.arguments || '{}')

      switch (name) {
        case 'search_clients': {
          const args = argsSchemas.search_clients.parse(rawArgs)
          const search = await searchClients(args.query)
          if (search.error) {
            content = JSON.stringify({ error: search.error })
          } else {
            // Only expose the display name to the model, never email/phone.
            content = JSON.stringify({
              clients: (search.clients || []).map((c) => ({
                id: c.id,
                name: clientDisplayName(c),
              })),
            })
          }
          break
        }

        case 'select_client': {
          const args = argsSchemas.select_client.parse(rawArgs)
          const supabase = await createClient()
          const { data: client } = await supabase
            .from('clients')
            .select('id, first_name, last_name, company_name, email, phone, created_by')
            .eq('id', args.client_id)
            .is('deleted_at', null)
            .maybeSingle()
          if (!client) {
            content = JSON.stringify({ error: 'Client not found.' })
          } else if (client.created_by !== userId && !isAdmin) {
            content = JSON.stringify({ error: 'You can only use clients you created.' })
          } else {
            result.draft = { ...result.draft, client }
            result.state = 'awaiting_items'
            // Confirm only the display name to the model.
            content = JSON.stringify({ success: true, name: clientDisplayName(client) })
          }
          break
        }

        case 'create_new_client': {
          const args = argsSchemas.create_new_client.parse(rawArgs)
          if (!isAdmin && !perms.clients_add) {
            content = JSON.stringify({ error: 'Your account is not allowed to add clients.' })
            break
          }
          if (!args.first_name.trim() || !args.last_name.trim()) {
            content = JSON.stringify({ error: 'First and last name are required.' })
            break
          }
          // Per-session cap: refuse the 6th create call in a single
          // session so a runaway loop or hostile transcript can't
          // mass-create half-formed client rows.
          const existingCreates = countClientCreatesInHistory(messages)
          if (existingCreates >= 5) {
            content = JSON.stringify({
              error: 'You have reached the maximum number of new clients for this session. Start a new invoice and let an admin review the records you created.',
            })
            break
          }
          const created = await createClientRecord({
            first_name: args.first_name.trim(),
            last_name: args.last_name.trim(),
            company_name: args.company_name?.trim(),
            ai_created: true,
            reviewed: false,
            notes: 'Created by the AI invoice assistant. Please review and complete contact details.',
          })
          if (created.error || !created.client) {
            content = JSON.stringify({ error: created.error || 'Could not create client.' })
          } else {
            result.draft = {
              ...result.draft,
              client: {
                id: created.client.id,
                first_name: created.client.first_name,
                last_name: created.client.last_name,
                company_name: created.client.company_name,
                email: created.client.email,
                phone: created.client.phone,
              },
            }
            result.state = 'awaiting_items'
            content = JSON.stringify({ success: true, name: clientDisplayName(created.client) })
          }
          break
        }

        case 'search_products': {
          const args = argsSchemas.search_products.parse(rawArgs)
          const search = await searchPublicProductsSmart(args.query)
          if (search.error) {
            content = JSON.stringify({ error: search.error })
          } else {
            content = JSON.stringify({
              totalMatches: search.totalMatches,
              tooMany: search.tooMany,
              categories: search.categories,
              products: search.products.map((p) => ({
                id: p.id,
                code: p.code,
                name: p.name,
                unit: p.unit,
                category: p.category,
                default_price: p.price,
                brand: p.brand,
                mpn: p.mpn,
                description: p.description ? p.description.slice(0, 160) : null,
                search_tags: p.searchTags?.slice(0, 8) ?? [],
                key_features: p.keyFeatures?.slice(0, 4) ?? [],
                applications: p.applications?.slice(0, 4) ?? [],
                dimensions: {
                  length_mm: p.lengthMm,
                  width_mm: p.widthMm,
                  thickness_mm: p.thicknessMm,
                },
              })),
            })
          }
          break
        }

        case 'prepare_line_item': {
          const args = argsSchemas.prepare_line_item.parse(rawArgs)
          const hasAnyDetail =
            args.product_name || args.product_id || args.quantity !== undefined || args.price !== undefined
          if (!hasAnyDetail) {
            content = JSON.stringify({ error: 'Provide at least a product name, quantity or price.' })
            break
          }
          if (args.quantity !== undefined && (!Number.isFinite(args.quantity) || args.quantity <= 0)) {
            content = JSON.stringify({ error: 'Quantity must be greater than 0.' })
            break
          }
          if (args.price !== undefined && (!Number.isFinite(args.price) || args.price < 0)) {
            content = JSON.stringify({ error: 'Price cannot be negative.' })
            break
          }
          result.draft = setPendingItem(result.draft, {
            product_id: args.product_id ?? null,
            product_code: args.product_code ?? null,
            product_name: args.product_name?.trim(),
            unit: args.unit?.trim(),
            quantity: args.quantity,
            price: args.price,
          })
          content = JSON.stringify({ success: true, pendingItem: result.draft.pendingItem })
          break
        }

        case 'add_line_item': {
          const args = argsSchemas.add_line_item.parse(rawArgs)
          if (!args.product_name.trim()) {
            content = JSON.stringify({ error: 'Product name is required.' })
            break
          }
          if (!Number.isFinite(args.quantity) || args.quantity <= 0) {
            content = JSON.stringify({ error: 'Quantity must be greater than 0.' })
            break
          }
          if (!Number.isFinite(args.price) || args.price < 0) {
            content = JSON.stringify({ error: 'Price cannot be negative.' })
            break
          }
          result.draft = addLineItem(result.draft, {
            product_id: args.product_id ?? null,
            product_code: args.product_code ?? null,
            product_name: args.product_name.trim(),
            unit: args.unit,
            quantity: args.quantity,
            price: args.price,
          })
          result.draft = clearPendingItem(result.draft)
          content = JSON.stringify({ success: true, item: result.draft.items[result.draft.items.length - 1] })
          break
        }

        case 'update_line_item': {
          const args = argsSchemas.update_line_item.parse(rawArgs)
          const index = args.index - 1
          if (args.quantity !== undefined && (!Number.isFinite(args.quantity) || args.quantity <= 0)) {
            content = JSON.stringify({ error: 'Quantity must be greater than 0.' })
            break
          }
          if (args.price !== undefined && (!Number.isFinite(args.price) || args.price < 0)) {
            content = JSON.stringify({ error: 'Price cannot be negative.' })
            break
          }
          const changes: Parameters<typeof updateLineItem>[2] = {}
          if (args.product_name !== undefined) changes.product_name = args.product_name.trim()
          if (args.quantity !== undefined) changes.quantity = args.quantity
          if (args.price !== undefined) changes.price = args.price
          if (args.unit !== undefined) changes.unit = args.unit.trim() || 'EA'
          const update = updateLineItem(result.draft, index, changes)
          if (update.error) {
            content = JSON.stringify({ error: update.error })
          } else {
            result.draft = update.draft
            content = JSON.stringify({ success: true })
          }
          break
        }

        case 'remove_line_item': {
          const args = argsSchemas.remove_line_item.parse(rawArgs)
          const removed = removeLineItem(result.draft, args.index - 1)
          if (removed.error) {
            content = JSON.stringify({ error: removed.error })
          } else {
            result.draft = removed.draft
            content = JSON.stringify({ success: true })
          }
          break
        }

        case 'set_delivery_address': {
          const args = argsSchemas.set_delivery_address.parse(rawArgs)
          if (!args.line_1.trim()) {
            content = JSON.stringify({ error: 'Address line 1 is required.' })
            break
          }
          result.draft = setDeliveryAddress(result.draft, {
            line_1: args.line_1.trim(),
            line_2: args.line_2?.trim(),
            town: args.town?.trim(),
            county: args.county?.trim(),
            postcode: args.postcode?.trim(),
          })
          result.state = 'confirming'
          content = JSON.stringify({ success: true })
          break
        }

        case 'change_client': {
          result.draft = { ...result.draft, client: null }
          result.state = 'awaiting_client'
          content = JSON.stringify({ success: true })
          break
        }

        case 'repeat_order': {
          // The system prompt already shows the client name; repeat only items/totals here.
          content = JSON.stringify({
            items: formatDraftItems(result.draft.items),
            totals: formatDraftTotals(result.draft),
          })
          break
        }

        case 'ready_to_confirm': {
          if (result.draft.items.length === 0) {
            content = JSON.stringify({ error: 'Add at least one item before confirming.' })
          } else if (result.state === 'awaiting_delivery_address') {
            result.state = 'confirming'
            content = JSON.stringify({ success: true })
          } else {
            result.state = 'awaiting_delivery_address'
            content = JSON.stringify({ success: true })
          }
          break
        }

        case 'create_invoice': {
          if (result.state !== 'confirming') {
            content = JSON.stringify({ error: 'Confirm the draft before creating the invoice.' })
            break
          }
          const createResult = await createInvoiceFromDraft(result.draft, result.state)
          if (createResult.error && !createResult.invoice) {
            content = JSON.stringify({ error: createResult.error })
          } else if (createResult.invoice) {
            // Partial success (e.g. stock warning) still marks created so
            // retries never mint a second document.
            result.draft = createResult.draft
            result.state = 'created'
            content = JSON.stringify({
              success: true,
              document_number: String(createResult.invoice?.document_number ?? ''),
              ...(createResult.warning || createResult.error
                ? { warning: createResult.warning || createResult.error }
                : {}),
            })
          } else {
            content = JSON.stringify({ error: createResult.error || 'Could not create invoice.' })
          }
          break
        }

        case 'share_whatsapp': {
          if (result.state !== 'created' && result.state !== 'done') {
            content = JSON.stringify({ error: 'Invoice must be created before sharing.' })
            break
          }
          const wa = buildWhatsAppAction(result.draft)
          if (wa.error) {
            content = JSON.stringify({ error: wa.error })
          } else {
            result.clientActions.push(wa.action)
            result.state = 'done'
            content = JSON.stringify({ success: true })
          }
          break
        }

        case 'send_email': {
          if (result.state !== 'created' && result.state !== 'done') {
            content = JSON.stringify({ error: 'Invoice must be created before sending email.' })
            break
          }
          if (!isAdmin && !perms.invoices_send_email) {
            content = JSON.stringify({ error: 'Your account is not allowed to send emails.' })
            break
          }
          const args = argsSchemas.send_email.parse(rawArgs)
          const emailAction = buildEmailAction(result.draft, args.recipient)
          if (emailAction.error) {
            content = JSON.stringify({ error: emailAction.error })
          } else {
            result.clientActions.push(emailAction.action)
            result.state = 'done'
            content = JSON.stringify({ success: true })
          }
          break
        }

        case 'download_pdf': {
          if (result.state !== 'created' && result.state !== 'done') {
            content = JSON.stringify({ error: 'Invoice must be created before downloading.' })
            break
          }
          const pdfAction = buildDownloadAction(result.draft)
          if (pdfAction.error) {
            content = JSON.stringify({ error: pdfAction.error })
          } else {
            result.clientActions.push(pdfAction.action)
            result.state = 'done'
            content = JSON.stringify({ success: true })
          }
          break
        }

        case 'new_invoice': {
          if (result.state !== 'created' && result.state !== 'done') {
            content = JSON.stringify({ error: 'Finish or create the current invoice first.' })
            break
          }
          result.draft = emptyDraft('invoice')
          result.state = 'awaiting_client'
          content = JSON.stringify({ success: true })
          break
        }

        case 'done': {
          result.state = 'done'
          content = JSON.stringify({ success: true })
          break
        }

        default: {
          content = JSON.stringify({ error: `Unknown tool: ${name}` })
        }
      }
    } catch (err) {
      content = JSON.stringify({
        error: err instanceof Error ? err.message : 'Invalid tool arguments.',
      })
    }

    result.messages.push({
      role: 'tool',
      content,
      tool_call_id: toolCall.id,
      name,
    })
  }

  return result
}

// ─────────────────────────────────────────────────────────────────────────────
// Invoice creation helpers
// ─────────────────────────────────────────────────────────────────────────────

async function createInvoiceFromDraft(
  draft: AssistantDraft,
  state: AssistantState
): Promise<{
  draft: AssistantDraft
  invoice?: Record<string, unknown>
  error?: string
  warning?: string
}> {
  if (!draft.client) {
    return { draft, error: 'No client selected.' }
  }
  if (draft.items.length === 0) {
    return { draft, error: 'Add at least one item before creating the invoice.' }
  }
  const invalidItem = draft.items.find((it) => it.quantity <= 0 || it.price < 0)
  if (invalidItem) {
    return { draft, error: 'Each item must have a positive quantity and a non-negative price.' }
  }
  if (state === 'created' || state === 'done') {
    return { draft, error: 'Invoice has already been created.' }
  }

  const clientId = 'id' in draft.client ? draft.client.id : undefined
  if (!clientId) {
    return { draft, error: 'Selected client has not been saved yet.' }
  }

  const issueDate = new Date().toISOString().split('T')[0]
  const result = await createInvoice({
    type: draft.type,
    client_id: clientId,
    issue_date: issueDate,
    items: draft.items.map((item) => ({
      product_id: item.product_id,
      product_code: item.product_code ?? undefined,
      product_name: item.product_name,
      unit: item.unit,
      quantity: item.quantity,
      price: item.price,
      vat_rate: item.vat_rate,
    })),
    apply_vat: draft.apply_vat,
    status: 'sent',
    delivery_address_line_1: draft.deliveryAddress?.line_1,
    delivery_address_line_2: draft.deliveryAddress?.line_2,
    delivery_town: draft.deliveryAddress?.town,
    delivery_county: draft.deliveryAddress?.county,
    delivery_postcode: draft.deliveryAddress?.postcode,
  })

  // Document may already exist even when stock/promote returned a warning.
  // Mark draft created so the agent never double-creates on retry.
  if (!result.invoice) {
    return { draft, error: result.error || 'Could not create invoice.' }
  }

  const invoice = result.invoice as Record<string, unknown>
  return {
    draft: {
      ...draft,
      createdInvoiceId: invoice.id as string,
      createdInvoice: invoice,
    },
    invoice,
    // Surface non-fatal post-create issues (e.g. stock) without blocking success.
    warning: result.error || undefined,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Client action builders
// ─────────────────────────────────────────────────────────────────────────────

function buildWhatsAppAction(draft: AssistantDraft): { action: ClientAction; error?: string } {
  const invoice = draft.createdInvoice
  const invoiceId = draft.createdInvoiceId
  if (!invoiceId || !invoice) {
    return { action: { type: 'open_whatsapp', text: '', url: '' }, error: 'Invoice not available.' }
  }
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL
  const token = (invoice.public_share_key as string | undefined) || (invoice.share_token as string | undefined)
  if (!baseUrl || !token) {
    return { action: { type: 'open_whatsapp', text: '', url: '' }, error: 'Share link not available.' }
  }

  const client = draft.client
  const shareUrl = buildInvoiceShareUrl({
    shareKey: invoice.public_share_key as string | undefined,
    shareToken: invoice.share_token as string | undefined,
    baseUrl,
  })
  const text = buildWhatsAppShareText({
    invoice: {
      document_number: String(invoice.document_number ?? ''),
      type: String(invoice.type ?? 'invoice'),
      total: typeof invoice.total === 'number' ? invoice.total : null,
      operator_name: typeof invoice.operator_name === 'string' ? invoice.operator_name : null,
      delivery_address_line_1: null,
      delivery_address_line_2: null,
      delivery_town: null,
      delivery_county: null,
      delivery_postcode: null,
      issue_date: typeof invoice.issue_date === 'string' ? invoice.issue_date : '',
    },
    client: {
      first_name: client?.first_name ?? null,
      last_name: client?.last_name ?? null,
      company_name: client?.company_name ?? null,
    },
    shareUrl,
  })

  return { action: { type: 'open_whatsapp', text, url: shareUrl } }
}

function buildEmailAction(draft: AssistantDraft, recipient?: string): { action: ClientAction; error?: string } {
  const invoiceId = draft.createdInvoiceId
  if (!invoiceId) {
    return { action: { type: 'send_email', invoice_id: '' }, error: 'Invoice ID missing.' }
  }
  const to = recipient?.trim() || draft.client?.email?.trim()
  if (!to) {
    return { action: { type: 'send_email', invoice_id: invoiceId }, error: 'No email address for the client.' }
  }
  if (!isLikelyValidEmail(to)) {
    return { action: { type: 'send_email', invoice_id: invoiceId }, error: 'Invalid email address.' }
  }
  return { action: { type: 'send_email', invoice_id: invoiceId, recipient: to } }
}

function buildDownloadAction(draft: AssistantDraft): { action: ClientAction; error?: string } {
  const invoiceId = draft.createdInvoiceId
  if (!invoiceId) {
    return { action: { type: 'download_pdf', invoice_id: '' }, error: 'Invoice ID missing.' }
  }
  return { action: { type: 'download_pdf', invoice_id: invoiceId } }
}
