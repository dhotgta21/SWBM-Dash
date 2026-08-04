import next from 'eslint-config-next'
import nextTypescript from 'eslint-config-next/typescript'

/** @type {import('eslint').Linter.Config[]} */
const eslintConfig = [
  ...next,
  ...nextTypescript,
  {
    ignores: ['.next-build/**', '.next/**', '.tmp/**', 'out/**', 'build/**', 'node_modules/**'],
  },
]

export default eslintConfig
