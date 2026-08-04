import { extractProductSearchTerms } from './lib/search'

const cases = [
  'fifty sheets of plasterboard',
  'thirteen bags of cement at £15 each',
  'MOT type 1 sub base',
  'eight by four plywood',
]

for (const c of cases) {
  console.log(c, '=>', extractProductSearchTerms(c))
}
