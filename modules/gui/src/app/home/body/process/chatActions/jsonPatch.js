// Hand-rolled RFC 6902 JSON Patch apply. Browser-safe; atomic per RFC 6902 §5
// (failure of any op aborts the whole patch without partial state).
//
// JsonPatchInvalidError -> envelope shape problems (unknown op, malformed
// pointer, missing required fields). JsonPatchApplyError -> the patch is
// well-formed but cannot apply against this document.

import _ from 'lodash'

export class JsonPatchInvalidError extends Error {}
export class JsonPatchApplyError extends Error {}

const SUPPORTED_OPS = new Set(['add', 'remove', 'replace', 'move', 'copy', 'test'])

export const applyJsonPatch = (document, operations) => {
    validateEnvelope(operations)
    const draft = {root: _.cloneDeep(document)}
    operations.forEach(op => applyOp(draft, op))
    return draft.root
}

const validateEnvelope = operations => {
    if (!Array.isArray(operations)) throw new JsonPatchInvalidError('operations must be an array')
    if (operations.length === 0) throw new JsonPatchInvalidError('operations must not be empty')
    operations.forEach((op, index) => validateOp(op, index))
}

const validateOp = (op, index) => {
    if (!op || typeof op !== 'object') throw new JsonPatchInvalidError(`operations[${index}] must be an object`)
    if (!SUPPORTED_OPS.has(op.op)) throw new JsonPatchInvalidError(`operations[${index}].op is not supported: ${op.op}`)
    if (typeof op.path !== 'string') throw new JsonPatchInvalidError(`operations[${index}].path must be a string`)
    if (op.path !== '' && !op.path.startsWith('/')) throw new JsonPatchInvalidError(`operations[${index}].path must be empty or start with "/"`)
    if (op.op === 'add' || op.op === 'replace' || op.op === 'test') {
        if (!Object.prototype.hasOwnProperty.call(op, 'value')) {
            throw new JsonPatchInvalidError(`operations[${index}].${op.op} requires a value`)
        }
    }
    if (op.op === 'move' || op.op === 'copy') {
        if (typeof op.from !== 'string') throw new JsonPatchInvalidError(`operations[${index}].${op.op} requires a from string`)
        if (op.from !== '' && !op.from.startsWith('/')) throw new JsonPatchInvalidError(`operations[${index}].from must be empty or start with "/"`)
    }
}

const applyOp = (draft, op) => {
    if (op.op === 'add') addAt(draft, parsePointer(op.path), _.cloneDeep(op.value))
    else if (op.op === 'remove') removeAt(draft, parsePointer(op.path))
    else if (op.op === 'replace') replaceAt(draft, parsePointer(op.path), _.cloneDeep(op.value))
    else if (op.op === 'move') {
        const from = parsePointer(op.from)
        const value = readAt(draft, from)
        removeAt(draft, from)
        addAt(draft, parsePointer(op.path), value)
    } else if (op.op === 'copy') {
        const value = _.cloneDeep(readAt(draft, parsePointer(op.from)))
        addAt(draft, parsePointer(op.path), value)
    } else if (op.op === 'test') {
        if (!_.isEqual(readAt(draft, parsePointer(op.path)), op.value)) {
            throw new JsonPatchApplyError(`test failed at ${op.path}`)
        }
    }
}

const parsePointer = pointer => {
    if (pointer === '') return []
    return pointer.slice(1).split('/').map(token => token.replace(/~1/g, '/').replace(/~0/g, '~'))
}

const readAt = (draft, tokens) => {
    if (tokens.length === 0) return draft.root
    const parent = navigateToParent(draft, tokens)
    const key = tokens[tokens.length - 1]
    if (Array.isArray(parent)) {
        const index = arrayIndex(key, parent.length, {append: false})
        return parent[index]
    }
    if (!Object.prototype.hasOwnProperty.call(parent, key)) {
        throw new JsonPatchApplyError(`path not found: /${tokens.join('/')}`)
    }
    return parent[key]
}

const addAt = (draft, tokens, value) => {
    if (tokens.length === 0) {
        draft.root = value
        return
    }
    const parent = navigateToParent(draft, tokens)
    const key = tokens[tokens.length - 1]
    if (Array.isArray(parent)) {
        const index = arrayIndex(key, parent.length, {append: true})
        parent.splice(index, 0, value)
    } else {
        parent[key] = value
    }
}

const removeAt = (draft, tokens) => {
    if (tokens.length === 0) throw new JsonPatchApplyError('cannot remove root')
    const parent = navigateToParent(draft, tokens)
    const key = tokens[tokens.length - 1]
    if (Array.isArray(parent)) {
        const index = arrayIndex(key, parent.length, {append: false})
        parent.splice(index, 1)
    } else {
        if (!Object.prototype.hasOwnProperty.call(parent, key)) {
            throw new JsonPatchApplyError(`path not found: /${tokens.join('/')}`)
        }
        delete parent[key]
    }
}

const replaceAt = (draft, tokens, value) => {
    if (tokens.length === 0) {
        draft.root = value
        return
    }
    const parent = navigateToParent(draft, tokens)
    const key = tokens[tokens.length - 1]
    if (Array.isArray(parent)) {
        const index = arrayIndex(key, parent.length, {append: false})
        parent[index] = value
    } else {
        if (!Object.prototype.hasOwnProperty.call(parent, key)) {
            throw new JsonPatchApplyError(`path not found: /${tokens.join('/')}`)
        }
        parent[key] = value
    }
}

const navigateToParent = (draft, tokens) => {
    let node = draft.root
    for (let i = 0; i < tokens.length - 1; i++) {
        const token = tokens[i]
        if (Array.isArray(node)) {
            const index = arrayIndex(token, node.length, {append: false})
            node = node[index]
        } else if (node !== null && typeof node === 'object' && Object.prototype.hasOwnProperty.call(node, token)) {
            node = node[token]
        } else {
            throw new JsonPatchApplyError(`path not found: /${tokens.slice(0, i + 1).join('/')}`)
        }
    }
    if (node === null || typeof node !== 'object') {
        throw new JsonPatchApplyError(`path not found: /${tokens.slice(0, -1).join('/')}`)
    }
    return node
}

// append=true: add op semantics — `-` sentinel and index === length both
// extend the array (RFC 6902 §4.1). append=false: target/source MUST exist,
// so index === length is out of bounds.
const arrayIndex = (token, length, {append}) => {
    if (append && token === '-') return length
    if (!/^\d+$/.test(token)) throw new JsonPatchApplyError(`invalid array index: ${token}`)
    const index = Number(token)
    const max = append ? length : length - 1
    if (index > max) throw new JsonPatchApplyError(`array index out of bounds: ${token}`)
    return index
}
