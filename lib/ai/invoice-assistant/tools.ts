import { type DeepSeekTool } from './types'

export const assistantTools: DeepSeekTool[] = [
  {
    type: 'function',
    function: {
      name: 'search_clients',
      description: 'Search the existing client database by name or company.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'The search term the user provided.' },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'select_client',
      description: 'Lock in an existing client for the invoice. Use after the user confirms which match.',
      parameters: {
        type: 'object',
        properties: {
          client_id: { type: 'string', description: 'The UUID of the selected client.' },
        },
        required: ['client_id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'create_new_client',
      description: 'Create a new client record in the database. Use only after the user confirms the details.',
      parameters: {
        type: 'object',
        properties: {
          first_name: { type: 'string' },
          last_name: { type: 'string' },
          company_name: { type: 'string' },
        },
        required: ['first_name', 'last_name'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'search_products',
      description:
        'Search the product catalogue by natural-language name or product code. Returns matching products plus disambiguation metadata (totalMatches, tooMany, categories).',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'The product name or description the user mentioned, e.g. "50 bags of gravel" or "bricks".' },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'prepare_line_item',
      description:
        'Save a partially captured product line when quantity, price or the exact product is still unclear. The pending details are shown in the next system prompt so you do not need to ask the user to repeat them.',
      parameters: {
        type: 'object',
        properties: {
          product_id: { type: 'string', description: 'Product UUID if already known.' },
          product_code: { type: 'string' },
          product_name: { type: 'string' },
          unit: { type: 'string', description: 'Unit of measure, e.g. EA, bag, m2.' },
          quantity: { type: 'number' },
          price: { type: 'number', description: 'Unit price in pounds.' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'add_line_item',
      description:
        'Add a complete product line to the draft invoice. Use when the product, quantity and price are all known. If the product was not found in the catalogue but the user provided a price, omit product_id to add a custom line.',
      parameters: {
        type: 'object',
        properties: {
          product_id: { type: 'string', description: 'Product UUID if matched from the catalogue.' },
          product_code: { type: 'string' },
          product_name: { type: 'string' },
          unit: { type: 'string', description: 'Unit of measure, e.g. EA, bag, m2.' },
          quantity: { type: 'number' },
          price: { type: 'number', description: 'Unit price in pounds.' },
        },
        required: ['product_name', 'quantity', 'price'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'update_line_item',
      description: 'Edit an existing line item by its 1-based index.',
      parameters: {
        type: 'object',
        properties: {
          index: { type: 'number', description: '1-based line item number.' },
          product_name: { type: 'string' },
          quantity: { type: 'number' },
          price: { type: 'number', description: 'Unit price in pounds.' },
          unit: { type: 'string' },
        },
        required: ['index'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'remove_line_item',
      description: 'Remove a line item by its 1-based index.',
      parameters: {
        type: 'object',
        properties: {
          index: { type: 'number', description: '1-based line item number.' },
        },
        required: ['index'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'change_client',
      description: 'Clear the selected client and go back to client selection.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'set_delivery_address',
      description: 'Set the delivery address for the invoice. Extract the address parts from what the user said.',
      parameters: {
        type: 'object',
        properties: {
          line_1: { type: 'string' },
          line_2: { type: 'string' },
          town: { type: 'string' },
          county: { type: 'string' },
          postcode: { type: 'string' },
        },
        required: ['line_1'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'repeat_order',
      description: 'Repeat the full draft order summary back to the user.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'ready_to_confirm',
      description: 'Move to confirming the draft. Use when the user says "next" or indicates they are finished, including when they want to skip the delivery address.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'create_invoice',
      description: 'Save the draft as a real invoice. Only call when the user confirms.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'share_whatsapp',
      description: 'Open WhatsApp with the invoice summary and public link. Only valid after create_invoice.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'send_email',
      description: 'Email the PDF to the client. Only valid after create_invoice.',
      parameters: {
        type: 'object',
        properties: {
          recipient: { type: 'string', description: 'Override email address. If omitted, uses the client email.' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'download_pdf',
      description: 'Download the invoice PDF. Only valid after create_invoice.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'new_invoice',
      description: 'Start a brand new invoice session. Only call when the current invoice is created or the session is done.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'done',
      description: 'Finish the session after an invoice is created and shared.',
      parameters: { type: 'object', properties: {} },
    },
  },
]
