const globals = require('globals')
const js = require('@eslint/js')
const stylistic = require('@stylistic/eslint-plugin')

const baseConfig = {
    files: ['**/*.js'],
    languageOptions: {
        ecmaVersion: 'latest',
        globals: {
            ...globals.jest,
            ...globals.node,
        }
    },
    plugins: {
        '@stylistic': stylistic,
    },
    rules: {
        ...js.configs.recommended.rules,
        '@stylistic/array-bracket-spacing': ['error', 'never'],
        '@stylistic/arrow-parens': ['error', 'as-needed'],
        '@stylistic/arrow-spacing': 'error',
        '@stylistic/brace-style': ['error', '1tbs', {allowSingleLine: true}],
        '@stylistic/comma-spacing': ['error', {before: false, after: true}],
        '@stylistic/computed-property-spacing': ['error', 'never'],
        '@stylistic/eol-last': ['error', 'always'],
        '@stylistic/indent': ['error', 4, {'SwitchCase': 1}],
        '@stylistic/key-spacing': ['error', {beforeColon: false, afterColon: true, mode: 'strict'}],
        '@stylistic/linebreak-style': ['error', 'unix'],
        '@stylistic/no-multi-spaces': ['error', {ignoreEOLComments: true}],
        '@stylistic/no-multiple-empty-lines': ['error', {max: 1, maxBOF: 0, maxEOF: 1}],
        '@stylistic/no-trailing-spaces': ['error', {skipBlankLines: true, ignoreComments: false}],
        '@stylistic/object-curly-spacing': ['error', 'never'],
        '@stylistic/quotes': ['error', 'single'],
        '@stylistic/semi': ['error', 'never'],
        '@stylistic/space-before-blocks': 'error',
        '@stylistic/space-in-parens': ['error', 'never'],
        '@stylistic/space-infix-ops': 'error',
        '@stylistic/template-curly-spacing': 'error',
        'no-console': ['error', {allow: ['info', 'warn', 'error']}],
        'no-unused-vars': ['error', {argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_'}],
    }
}

module.exports = [baseConfig]
