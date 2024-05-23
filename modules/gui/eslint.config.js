const globals = require('globals')
const js = require('@eslint/js')

const babelParser = require('@babel/eslint-parser')
const babelPresetEnv = require('@babel/preset-env')
const babelPresetReact = require('@babel/preset-react')

const reactPlugin = require('eslint-plugin-react')
const reactHooksPlugin = require('eslint-plugin-react-hooks')
const importPlugin = require('eslint-plugin-import')
const simpleImportSort = require('eslint-plugin-simple-import-sort')

const baseConfig = {
    files: ['**/*.js'],
    languageOptions: {
        ecmaVersion: 'latest',
        globals: {
            ...globals.browser,
            ...globals.jest,
            ...globals.node,
        },
        parser: babelParser,
        parserOptions: {
            requireConfigFile: false,
            babelOptions: {
                babelrc: false,
                configFile: false,
                presets: [
                    babelPresetEnv,
                    babelPresetReact
                ]
            }
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
        'indent': ['error', 4],
        'key-spacing': ['error', {beforeColon: false, afterColon: true, mode: 'strict'}],
        'linebreak-style': ['error', 'unix'],
        'no-console': ['error', {allow: ['info', 'warn', 'error']}],
        'no-multi-spaces': ['error', {ignoreEOLComments: true}],
        'no-multiple-empty-lines': ['error', {max: 1, maxBOF: 0, maxEOF: 1}],
        'no-trailing-spaces': ['error', {skipBlankLines: true, ignoreComments: false}],
        'no-unused-vars': ['error', {argsIgnorePattern: '^_', varsIgnorePattern: '^_'}],
        'object-curly-spacing': ['error', 'never'],
        'quotes': ['error', 'single'],
        'semi': ['error', 'never'],
        'space-before-blocks': 'error',
        'space-in-parens': ['error', 'never'],
        'space-infix-ops': 'error',
        'template-curly-spacing': 'error'
    }
}

const reactConfig = {
    plugins: {
        react: reactPlugin,
    },
    rules: {
        ...reactPlugin.configs['jsx-runtime'].rules,
        'react/jsx-uses-vars': 'error',
        'react/jsx-tag-spacing': [
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

const reactHooksConfig = {
    plugins: {
        'react-hooks': reactHooksPlugin,
    },
    rules: {
        ...reactHooksPlugin.configs.recommended.rules
    }
}

const importConfig = {
    plugins: {
        'simple-import-sort': simpleImportSort,
        import: importPlugin
    },
    rules: {
        'simple-import-sort/imports': 'error',
        'simple-import-sort/exports': 'error',
        'import/first': 'error',
        'import/newline-after-import': 'error',
        'import/no-duplicates': 'error'
    }
}

module.exports = [
    baseConfig, reactConfig, reactHooksConfig, importConfig
]
