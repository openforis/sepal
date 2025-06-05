const globals = require('globals')
const js = require('@eslint/js')

const baseConfig = {
    files: ['**/*.js'],
    languageOptions: {
        ecmaVersion: 'latest',
        globals: {
            ...globals.jest,
            ...globals.node,
        }
    },
    rules: {
        ...js.configs.recommended.rules,
        'array-bracket-spacing': ['error', 'never'],
        'arrow-parens': ['error', 'as-needed'],
        'arrow-spacing': 'error',
        'brace-style': ['error', '1tbs', {allowSingleLine: true}],
        'comma-spacing': ['error', {before: false, after: true}],
        'computed-property-spacing': ['error', 'never'],
        'eol-last': ['error', 'always'],
        'indent': ['error', 4, {'SwitchCase': 1}],
        'key-spacing': ['error', {beforeColon: false, afterColon: true, mode: 'strict'}],
        'linebreak-style': ['error', 'unix'],
        'no-console': ['error', {allow: ['info', 'warn', 'error']}],
        'no-multi-spaces': ['error', {ignoreEOLComments: true}],
        'no-multiple-empty-lines': ['error', {max: 1, maxBOF: 0, maxEOF: 1}],
        'no-trailing-spaces': ['error', {skipBlankLines: true, ignoreComments: false}],
        'no-unused-vars': ['error', {argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_'}],
        'object-curly-spacing': ['error', 'never'],
        'quotes': ['error', 'single'],
        'semi': ['error', 'never'],
        'space-before-blocks': 'error',
        'space-in-parens': ['error', 'never'],
        'space-infix-ops': 'error',
        'template-curly-spacing': 'error'
    }
}

module.exports = [baseConfig]
