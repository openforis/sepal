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
        "no-console": [
            "error", {
                allow: ["info", "warn", "error"]
            }
        ],
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
