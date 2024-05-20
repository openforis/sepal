const globals = require('globals')
const js = require('@eslint/js')
const babelParser = require('@babel/eslint-parser')
const babelPresetEnv = require('@babel/preset-env')
const babelPresetReact = require('@babel/preset-react')

const reactPlugin = require('eslint-plugin-react')
const reactHooksPlugin = require('eslint-plugin-react-hooks')
const importPlugin = require('eslint-plugin-import')
const simpleImportSort = require('eslint-plugin-simple-import-sort')

module.exports = [
    {
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
            'arrow-parens': [
                'warn',
                'as-needed'
            ],
            'arrow-spacing': [
                'warn'
            ],
            'brace-style': [
                'warn', '1tbs', {
                    'allowSingleLine': true
                }
            ],
            'comma-spacing': [
                'warn', {
                    'before': false,
                    'after': true
                }
            ],
            'eol-last': [
                'warn',
                'always'
            ],
            'indent': [
                'warn',
                4
            ],
            'key-spacing': [
                'warn', {
                    'beforeColon': false,
                    'afterColon': true,
                    'mode': 'strict'
                }
            ],
            'linebreak-style': [
                'warn',
                'unix'
            ],
            'no-console': [
                'warn', {
                    'allow': ['info', 'warn', 'error']
                }
            ],
            'no-multi-spaces': [
                'warn', {
                    'ignoreEOLComments': true
                }
            ],
            'no-multiple-empty-lines': [
                'warn', {
                    'max': 1,
                    'maxBOF': 0,
                    'maxEOF': 1
                }
            ],
            'no-trailing-spaces': [
                'warn', {
                    'skipBlankLines': true,
                    'ignoreComments': false
                }
            ],
            'no-unused-vars': [
                'warn', {
                    'argsIgnorePattern': '^_',
                    'varsIgnorePattern': '^_'
                }
            ],
            'object-curly-spacing': [
                'warn',
                'never'
            ],
            'quotes': [
                'warn',
                'single'
            ],
            'react/jsx-uses-react': 'error',
            'react/jsx-uses-vars': 'error',
            'react/jsx-tag-spacing': [
                'warn', {
                    'closingSlash': 'never',
                    'beforeSelfClosing': 'never',
                    'afterOpening': 'never',
                    'beforeClosing': 'allow'
                }
            ],
            'react/prop-types': 0,
            'react/sort-prop-types': [
                'warn', {
                    'ignoreCase': true,
                    'callbacksLast': true,
                    'requiredFirst': true,
                    'sortShapeProp': true,
                    'noSortAlphabetically': false
                }
            ],
            'semi': [
                'warn',
                'never'
            ],
            'space-before-blocks': 'warn',
            'space-in-parens': ['warn', 'never'],
            'space-infix-ops': 'warn',
            'template-curly-spacing': [
                'warn'
            ]
        }
    }, {
        plugins: {
            react: reactPlugin,
        },
        rules: {
            ...reactPlugin.configs['jsx-runtime'].rules
        },
        settings: {
            react: {
                version: 'detect'
            }
        }
    }, {
        plugins: {
            'react-hooks': reactHooksPlugin,
        },
        rules: {
            ...reactHooksPlugin.configs.recommended.rules
        }
    }, {
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
]
