module.exports = {
    "parser": "babel-eslint",
    "env": {
        "node":  true,
        "browser": true,
        "amd": true,
        "es6": true
    },
    "extends": [
        "eslint:recommended",
        "plugin:react/recommended",
        // "plugin:import/errors",
        // "plugin:import/warnings"
    ],
    "parserOptions": {
        "ecmaVersion": 9,
        "ecmaFeatures": {
            "jsx": true
        },
        "sourceType": "module"
    },
    "plugins": [
        "react",
        // "import",
        "sort-imports-es6-autofix"
    ],
    "settings": {
        "react": {
            "version": "16.4"
        }
    },
    "rules": {
        "arrow-parens": [
            "error", 
            "as-needed"
        ],
        "comma-spacing": [
            "error", {
                "before": false,
                "after": true
            }
        ],
        "eol-last": [
            "error",
            "always"
        ],
        "indent": [
            "error",
            4
        ],
        "linebreak-style": [
            "error",
            "unix"
        ],
        "no-console": [
            "error", {
                allow: ["info", "warn", "error"]
            }
        ],
        "no-multi-spaces": [
            "error", {
                ignoreEOLComments: true
            }
        ],
        "no-multiple-empty-lines": [
            "error", {
                "max": 1,
                "maxBOF": 0,
                "maxEOF": 1
            }
        ],
        "no-trailing-spaces": [
            "error", {
                "skipBlankLines": true,
                "ignoreComments": false
            }
        ],
        "no-unused-vars": [
            "error", {
                "argsIgnorePattern": "^_",
                "varsIgnorePattern": "^_"
            }
        ],
        "object-curly-spacing": [
            "error",
            "never"
        ],
        "quotes": [
            "error",
            "single"
        ],
        "react/jsx-tag-spacing": [
            "error", {
                "closingSlash": "never",
                "beforeSelfClosing": "never",
                "afterOpening": "never",
                "beforeClosing": "allow"
            }
        ],
        "react/prop-types": 0,
        "react/sort-prop-types": [
            "error", {
                "ignoreCase": true,
                "callbacksLast": true,
                "requiredFirst": true,
                "sortShapeProp": true,
                "noSortAlphabetically": false
            }
        ],
        "semi": [
            "error",
            "never"
        ],
        "sort-imports-es6-autofix/sort-imports-es6": ["error", {
            "ignoreCase": false,
            "ignoreMemberSort": false,
            "memberSyntaxSortOrder": ["none", "all", "multiple", "single"]
        }]
    }
};
