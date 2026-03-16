const globals = require('globals')
const js = require('@eslint/js')
const stylistic = require('@stylistic/eslint-plugin')

const reactPlugin = require('eslint-plugin-react')
// const reactHooksPlugin = require('eslint-plugin-react-hooks')
// const importPlugin = require('eslint-plugin-import')
const simpleImportSort = require('eslint-plugin-simple-import-sort')

const baseConfig = {
    files: ['**/*.js', '**/*.jsx'],
    languageOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
        globals: {
            ...globals.browser,
            ...globals.jest,
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

const reactConfig = {
    plugins: {
        react: reactPlugin,
    },
    rules: {
        ...reactPlugin.configs['jsx-runtime'].rules,
        'react/jsx-uses-vars': 'error',
        '@stylistic/jsx-tag-spacing': [
            'warn', {
                'closingSlash': 'never',
                'beforeSelfClosing': 'never',
                'afterOpening': 'never',
                'beforeClosing': 'allow'
            }
        ],
        'react/prop-types': 'off',
        'react/sort-prop-types': [
            'warn', {
                'ignoreCase': true,
                'callbacksLast': true,
                'requiredFirst': true,
                'sortShapeProp': true,
                'noSortAlphabetically': false
            }
        ],
    },
    settings: {
        react: {
            version: 'detect'
        }
    }
}

// const reactHooksConfig = {
//     plugins: {
//         'react-hooks': reactHooksPlugin,
//     },
//     rules: {
//         ...reactHooksPlugin.configs.recommended.rules
//     }
// }

const importConfig = {
    plugins: {
        'simple-import-sort': simpleImportSort,
        // import: importPlugin
    },
    rules: {
        'simple-import-sort/imports': 'error',
        'simple-import-sort/exports': 'error',
        // 'import/first': 'error',
        // 'import/newline-after-import': 'error',
        // 'import/no-duplicates': 'error'
    }
}

module.exports = [
    baseConfig,
    reactConfig,
    // reactHooksConfig,
    importConfig
]
