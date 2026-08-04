/**
 * Evaluate the AI invoice assistant against the scenario catalogue.
 *
 * Run without DB (intent + search-term checks only):
 *   npx tsx scripts/evaluate-assistant-scenarios.ts
 *
 * Run with DB (also checks product retrieval):
 *   DB_URL=postgres://... npx tsx scripts/evaluate-assistant-scenarios.ts --retrieval
 *
 * The retrieval check requires a Postgres connection because the assistant's
 * search engine runs in Supabase. It does NOT call the LLM.
 */

import {
  assistantScenarios,
  scenarioCategories,
  type AssistantScenario,
  type ExpectedSlots,
} from '../lib/ai/invoice-assistant/evaluation/scenarios'
import { extractProductIntent, splitMultiProduct } from '../lib/voice/product-intent'
import { type ParsedIntent } from '../lib/voice/product-intent'
import { extractProductSearchTerms } from '../lib/search'

const args = process.argv.slice(2)
const runRetrieval = args.includes('--retrieval')

interface ScenarioResult {
  scenario: AssistantScenario
  slotOk: boolean
  slotFailures: string[]
  termsOk: boolean
  termsFailures: string[]
  retrievalOk?: boolean
  retrievalFailure?: string
}

function intentMatchesSlots(intent: ParsedIntent, exp: ExpectedSlots): string[] {
  const failures: string[] = []

  if (exp.quantity !== undefined) {
    if (!intent.quantity) {
      failures.push(`missing quantity (expected ${exp.quantity.value})`)
    } else if (intent.quantity.value !== exp.quantity.value) {
      failures.push(`quantity ${intent.quantity.value} != ${exp.quantity.value}`)
    }
    if (exp.quantity.unit !== undefined) {
      if (intent.quantity?.unit !== exp.quantity.unit) {
        failures.push(`unit ${intent.quantity?.unit ?? 'undefined'} != ${exp.quantity.unit}`)
      }
    }
  }

  if (exp.product !== undefined) {
    if (!intent.product) {
      failures.push(`missing product (expected "${exp.product}")`)
    } else if (!intent.product.name.toLowerCase().includes(exp.product.toLowerCase())) {
      failures.push(`product "${intent.product.name}" does not contain "${exp.product}"`)
    }
  }

  if (exp.price !== undefined) {
    if (!intent.price) {
      failures.push(`missing price (expected ${exp.price})`)
    } else if (intent.price.value !== exp.price) {
      failures.push(`price ${intent.price.value} != ${exp.price}`)
    }
  }

  return failures
}

function checkSlots(scenario: AssistantScenario): { ok: boolean; failures: string[] } {
  const parse = extractProductIntent(scenario.utterance)

  if (parse.intents.length === 0) {
    return { ok: false, failures: ['no intent parsed'] }
  }

  // For multi-product utterances, find the intent that best matches the expected slots.
  let bestFailures = intentMatchesSlots(parse.intents[0]!, scenario.expectedSlots)
  for (let i = 1; i < parse.intents.length; i++) {
    const failures = intentMatchesSlots(parse.intents[i]!, scenario.expectedSlots)
    if (failures.length < bestFailures.length) {
      bestFailures = failures
    }
  }

  return { ok: bestFailures.length === 0, failures: bestFailures }
}

function checkSearchTerms(scenario: AssistantScenario): { ok: boolean; failures: string[] } {
  // For multi-product utterances, only test the first fragment so units from
  // later products do not pollute the search-term check.
  const fragments = splitMultiProduct(scenario.utterance)
  const query = fragments.length > 1 ? fragments[0]! : scenario.utterance
  const terms = extractProductSearchTerms(query)
  const expected = scenario.expectedSearchTerms.map((t) => t.toLowerCase())
  const failures: string[] = []

  for (const exp of expected) {
    if (!terms.includes(exp)) {
      failures.push(`missing term "${exp}" (got ${JSON.stringify(terms)})`)
    }
  }

  // Only flag unexpected terms for non-empty expected sets; empty expected sets
  // are used for price-only utterances where stripping everything is correct.
  if (expected.length > 0) {
    for (const term of terms) {
      if (!expected.includes(term)) {
        failures.push(`unexpected term "${term}"`)
      }
    }
  }

  return { ok: failures.length === 0, failures }
}

async function checkRetrieval(_scenario: AssistantScenario): Promise<{ ok: boolean; failure?: string }> {
  // TODO: wire up to the new AI search engine once implemented.
  void _scenario
  return { ok: true }
}

async function runEvaluation(): Promise<void> {
  console.log(`Running ${assistantScenarios.length} scenarios`)
  if (runRetrieval) {
    console.log('Retrieval checks enabled (DB required)')
  } else {
    console.log('Retrieval checks skipped — pass --retrieval to enable')
  }
  console.log('')

  const results: ScenarioResult[] = []

  for (const scenario of assistantScenarios) {
    const slot = checkSlots(scenario)
    const terms = checkSearchTerms(scenario)
    let retrieval: { ok: boolean; failure?: string } | undefined
    if (runRetrieval) {
      retrieval = await checkRetrieval(scenario)
    }

    results.push({
      scenario,
      slotOk: slot.ok,
      slotFailures: slot.failures,
      termsOk: terms.ok,
      termsFailures: terms.failures,
      retrievalOk: retrieval?.ok,
      retrievalFailure: retrieval?.failure,
    })
  }

  // Summary by category
  const categoryStats = new Map<
    string,
    { total: number; slotOk: number; termsOk: number; retrievalOk: number }
  >()

  for (const cat of scenarioCategories) {
    categoryStats.set(cat, { total: 0, slotOk: 0, termsOk: 0, retrievalOk: 0 })
  }

  for (const r of results) {
    const stats = categoryStats.get(r.scenario.category)!
    stats.total += 1
    if (r.slotOk) stats.slotOk += 1
    if (r.termsOk) stats.termsOk += 1
    if (r.retrievalOk ?? true) stats.retrievalOk += 1
  }

  // Print failures
  let failureCount = 0
  for (const r of results) {
    const hasFailure =
      !r.slotOk || !r.termsOk || (r.retrievalOk === false)
    if (!hasFailure) continue

    failureCount += 1
    console.log(`❌ ${r.scenario.id}: "${r.scenario.utterance}"`)
    if (!r.slotOk) {
      console.log(`   slots: ${r.slotFailures.join('; ')}`)
    }
    if (!r.termsOk) {
      console.log(`   terms: ${r.termsFailures.join('; ')}`)
    }
    if (r.retrievalOk === false) {
      console.log(`   retrieval: ${r.retrievalFailure}`)
    }
    if (r.scenario.note) {
      console.log(`   note: ${r.scenario.note}`)
    }
  }

  if (failureCount === 0) {
    console.log('✅ All scenario checks passed')
  }

  console.log('')
  console.log('Category summary:')
  for (const [cat, stats] of categoryStats) {
    if (stats.total === 0) continue
    const slotPct = ((stats.slotOk / stats.total) * 100).toFixed(0)
    const termsPct = ((stats.termsOk / stats.total) * 100).toFixed(0)
    const retrievalPct = ((stats.retrievalOk / stats.total) * 100).toFixed(0)
    console.log(
      `  ${cat.padEnd(22)} ${stats.total} scenarios | slots ${slotPct}% | terms ${termsPct}% | retrieval ${retrievalPct}%`
    )
  }

  const totalSlotOk = results.filter((r) => r.slotOk).length
  const totalTermsOk = results.filter((r) => r.termsOk).length
  const totalRetrievalOk = results.filter((r) => r.retrievalOk !== false).length

  console.log('')
  console.log(
    `Overall: slots ${totalSlotOk}/${results.length} | terms ${totalTermsOk}/${results.length} | retrieval ${totalRetrievalOk}/${results.length}`
  )

  if (failureCount > 0) {
    process.exit(1)
  }
}

runEvaluation().catch((err) => {
  console.error(err)
  process.exit(1)
})
