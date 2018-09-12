module.exports = {
    "parser": "babel-eslint",
    "env": {
        "browser": true,
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
        "indent": [
            "error",
            4
        ],
        "linebreak-style": [
            "error",
            "unix"
        ],
        "quotes": [
            "error",
            "single"
        ],
        "semi": [
            "error",
            "never"
        ],
        "comma-spacing": [
            "error", {
                "before": false,
                "after": true
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
                "argsIgnorePattern": "^_"
            }
        ],
        "object-curly-spacing": [
            "error",
            "never"
        ],
        "eol-last": [
            "error", 
            "always"
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
        // "import/no-unresolved": 0,
        // "import/named": 0,
        // "import/namespace": 0,
        // "import/default": 0,
        // "import/export": 0,
        "sort-imports-es6-autofix/sort-imports-es6": ["error", {
            "ignoreCase": false,
            "ignoreMemberSort": false,
            "memberSyntaxSortOrder": ["none", "all", "multiple", "single"]
        }]
    }
};