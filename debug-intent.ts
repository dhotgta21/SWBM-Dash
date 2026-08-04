import { extractProductIntent } from './lib/voice/product-intent'

const cases = [
  'six by two c24 timber',
  'eight by four plywood sheet at £35',
  'fifteen quid a bag',
  'ten bags at fifty pence',
  'twelve pounds fifty each',
  '15 per bag',
  'half a tonne of gravel',
  'Windsor brake 30 of them price that 20p each',
  '4x2 timber, ten lengths at £8 each',
  'fifty sheets of plasterboard',
]

for (const c of cases) {
  const r = extractProductIntent(c)
  console.log('\n' + c)
  console.log(JSON.stringify(r.intents[0], null, 2))
}
