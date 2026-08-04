export type AssistantState =
  | 'awaiting_client'
  | 'awaiting_items'
  | 'awaiting_delivery_address'
  | 'confirming'
  | 'created'
  | 'done'

export interface AssistantClient {
  id: string
  first_name: string | null
  last_name: string | null
  company_name: string | null
  email: string | null
  phone: string | null
}

export interface AssistantDraftClient {
  first_name: string
  last_name: string
  phone?: string
  email?: string
  company_name?: string
}

export interface AssistantLineItem {
  product_id?: string | null
  product_code?: string | null
  product_name: string
  unit?: string
  quantity: number
  price: number
  vat_rate: number
  vat_amount?: number
  line_total?: number
}

export interface AssistantDeliveryAddress {
  line_1?: string
  line_2?: string
  town?: string
  county?: string
  postcode?: string
}

export interface AssistantDraft {
  type: 'invoice' | 'quotation'
  client?: AssistantClient | AssistantDraftClient | null
  items: AssistantLineItem[]
  // product details collected so far when the assistant is still asking for
  // quantity, price or disambiguation
  pendingItem?: Partial<AssistantLineItem> | null
  deliveryAddress?: AssistantDeliveryAddress | null
  apply_vat: boolean
  /** Company default VAT percentage when apply_vat is true (e.g. 20). */
  vat_rate_percent?: number
  // computed on the server after every mutation
  subtotal?: number
  vat_total?: number
  total?: number
  // populated after create_invoice so post-create actions know the target
  createdInvoiceId?: string
  createdInvoice?: Record<string, unknown>
}

export interface AssistantMessage {
  role: 'user' | 'assistant' | 'tool'
  content: string
  tool_call_id?: string
  name?: string
  // Populated by the server when an assistant message includes tool calls.
  // The client does not render these, but it round-trips them so the model
  // can correlate tool results with the assistant's request.
  tool_calls?: DeepSeekToolCall[]
}

export interface AssistantStepInput {
  messages: AssistantMessage[]
  draft: AssistantDraft
  state: AssistantState
}

export type ClientAction =
  | { type: 'open_whatsapp'; text: string; url: string }
  | { type: 'send_email'; invoice_id: string; recipient?: string }
  | { type: 'download_pdf'; invoice_id: string }

export interface AssistantStepResult {
  messages: AssistantMessage[]
  draft: AssistantDraft
  state: AssistantState
  assistantMessage: string
  clientActions?: ClientAction[]
  error?: string
}

// ─────────────────────────────────────────────────────────────────────────────
// DeepSeek/OpenAI-compatible API types
// ─────────────────────────────────────────────────────────────────────────────

export interface DeepSeekToolCall {
  id: string
  type: 'function'
  function: {
    name: string
    arguments: string
  }
}

export type DeepSeekContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } }

export interface DeepSeekMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string | DeepSeekContentPart[]
  tool_call_id?: string
  name?: string
  tool_calls?: DeepSeekToolCall[]
}

export interface DeepSeekTool {
  type: 'function'
  function: {
    name: string
    description: string
    parameters: Record<string, unknown>
  }
}


