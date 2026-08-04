import { extractProductIntent } from './lib/voice/product-intent'
import { extractProductSearchTerms } from './lib/search'

const cases = [
  'a hundred concrete blocks 100mm',
  '4x2 timber, ten lengths at £8 each',
  '13 bags cement and 5 tonnes gravel',
]

for (const c of cases) {
  console.log('\n' + c)
  const r = extractProductIntent(c)
  console.log('intents:', JSON.stringify(r.intents, null, 2))
  console.log('search terms:', extractProductSearchTerms(c))
}
