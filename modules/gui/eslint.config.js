const globals = require('globals')
const js = require('@eslint/js')
const stylistic = require('@stylistic/eslint-plugin')
const reactPlugin = require('eslint-plugin-react')
const simpleImportSort = require('eslint-plugin-simple-import-sort')

module.exports = [
    {
        files: ['**/*.test.js', '**/*.test.jsx', '**/*.spec.js', '**/*.spec.jsx'],
        languageOptions: {
            globals: globals.jest,
        }
    },
    {
        files: ['**/*.js', '**/*.jsx'],
        languageOptions: {
            ecmaVersion: 'latest',
            sourceType: 'module',
            globals: {
                ...globals.browser,
                ...globals.node,
            },
            parserOptions: {
                ecmaFeatures: {
                    jsx: true
                }
            }
        },
        plugins: {
            '@stylistic': stylistic,
            react: reactPlugin,
            'simple-import-sort': simpleImportSort,
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
            '@stylistic/jsx-tag-spacing': [
                'warn', {
                    'closingSlash': 'never',
                    'beforeSelfClosing': 'never',
                    'afterOpening': 'never',
                    'beforeClosing': 'allow'
                }
            ],
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
            ...reactPlugin.configs['jsx-runtime'].rules,
            'react/jsx-uses-vars': 'error',
            'react/prop-types': 'off',
            'simple-import-sort/imports': 'error',
            'simple-import-sort/exports': 'error',
        },
        settings: {
            react: {
                version: 'detect'
            }
        }
    }
]
