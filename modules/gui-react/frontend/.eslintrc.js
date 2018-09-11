module.exports = {
    "parser": "babel-eslint",
    "env": {
        "browser": true,
        "es6": true
    },
    "extends": [
        "eslint:recommended",
        "plugin:react/recommended"
    ],
    "parserOptions": {
        "ecmaVersion": 6,
        "ecmaFeatures": {
            "jsx": true
        },
        "sourceType": "module"
    },
    "plugins": [
        "react",
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
        "react/sort-prop-types": [
            "error", {
                "ignoreCase": true,
                "callbacksLast": true,
                "requiredFirst": true,
                "sortShapeProp": true,
                "noSortAlphabetically": false
            }
        ],
        "sort-imports-es6-autofix/sort-imports-es6": ["error", {
            "ignoreCase": false,
            "ignoreMemberSort": false,
            "memberSyntaxSortOrder": ["none", "all", "multiple", "single"]
        }]
    }
};