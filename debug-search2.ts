import { extractProductSearchTerms } from './lib/search'

const q = 'a hundred concrete blocks 100mm'
console.log(extractProductSearchTerms(q))
