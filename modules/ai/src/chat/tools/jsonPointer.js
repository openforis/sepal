// RFC 6901 JSON Pointer.

function parsePointer(pointer) {
    if (pointer === '') return []
    if (!pointer.startsWith('/')) {
        throw new Error(`Invalid JSON Pointer: ${JSON.stringify(pointer)} — must be empty or start with "/"`)
    }
    return pointer.slice(1).split('/').map(unescapeToken)
}

function resolvePointer(document, tokens) {
    return tokens.reduce(step, document)

    function step(node, token) {
        if (Array.isArray(node)) {
            const index = arrayIndex(token)
            if (index === null || index >= node.length) {
                throw new Error(`JSON Pointer path not found: array index ${JSON.stringify(token)}`)
            }
            return node[index]
        }
        if (isObject(node) && Object.prototype.hasOwnProperty.call(node, token)) {
            return node[token]
        }
        throw new Error(`JSON Pointer path not found: ${JSON.stringify(token)}`)
    }
}

function formatPointer(tokens) {
    return tokens.map(token => `/${escapeToken(String(token))}`).join('')
}

function unescapeToken(token) {
    return token.replace(/~1/g, '/').replace(/~0/g, '~')
}

function escapeToken(token) {
    return token.replace(/~/g, '~0').replace(/\//g, '~1')
}

function arrayIndex(token) {
    return /^\d+$/.test(token) ? Number(token) : null
}

function isObject(value) {
    return value !== null && typeof value === 'object'
}

module.exports = {parsePointer, resolvePointer, formatPointer}
