// Generic, recipe-agnostic shape of the field at a JSON Pointer in a recipe
// schema: its value kind, whether the parent requires it, and — for arrays —
// whether it reads as a config/enum array (safe to replace wholesale) or a
// larger data array (indexed edits). Lets a patch planner pick valid JSON Patch
// operations without recipe-specific knowledge.

function fieldShapeAt(schema, pointer) {
    const tokens = parsePointer(pointer)
    let node = resolve(schema, schema)
    let parent = null
    let parentKey = null
    for (const token of tokens) {
        if (!node) return unknownShape()
        parent = node
        parentKey = token
        node = childSchema(node, token, schema)
    }
    if (!node) return unknownShape()
    const valueKind = valueKindOf(node)
    return {
        valueKind,
        required: Boolean(parent?.required?.includes?.(parentKey)),
        ...(valueKind === 'array' ? {arrayKind: arrayKindOf(node, schema)} : {})
    }
}

// Array members address by index, not by value name, so a non-numeric token
// under an array has no schema child — the caller learns the path is unknown.
function childSchema(node, token, root) {
    if (node.type === 'array' || node.items) {
        return /^\d+$/.test(token) ? resolve(node.items, root) : null
    }
    if (node.properties && Object.prototype.hasOwnProperty.call(node.properties, token)) {
        return resolve(node.properties[token], root)
    }
    return null
}

function valueKindOf(node) {
    if (node.type === 'array' || node.items) return 'array'
    if (node.type === 'object' || node.properties) return 'object'
    const compositeKind = compositeValueKindOf(node)
    if (compositeKind) return compositeKind
    return 'scalar'
}

function compositeValueKindOf(node) {
    const variants = node.oneOf || node.anyOf || node.allOf
    if (!variants?.length) return null
    const kinds = [...new Set(variants.map(valueKindOf))]
    return kinds.length === 1 ? kinds[0] : 'unknown'
}

function arrayKindOf(node, root) {
    const items = resolve(node.items, root)
    if (items?.enum) return 'config'
    if (items?.type === 'object' || items?.type === 'array') return 'data'
    return 'unknown'
}

function unknownShape() {
    return {valueKind: 'unknown', required: false}
}

function resolve(node, root) {
    if (node?.$ref) {
        const target = node.$ref.replace(/^#\//, '').split('/').reduce((current, segment) => current?.[segment], root)
        const {$ref: _ref, ...rest} = node
        return {...target, ...rest}
    }
    return node
}

function parsePointer(pointer) {
    if (!pointer) return []
    return pointer.replace(/^\//, '').split('/').map(token => token.replace(/~1/g, '/').replace(/~0/g, '~'))
}

module.exports = {fieldShapeAt}
