// Generic, recipe-agnostic extraction of enum value labels from JSON Schema.
// Keeps the patch token and the user-facing label together, so LLM consumers
// can use raw values in tools while speaking labels to users.

function valueLabelsFromSchema(schema) {
    const lines = []
    walk(schema, schema, '', lines)
    return lines.join('\n')
}

function walk(schema, root, prefix, lines) {
    const resolved = resolve(schema, root)
    if (!resolved?.properties) return
    for (const key of Object.keys(resolved.properties)) {
        const path = `${prefix}/${key}`
        const subschema = resolve(resolved.properties[key], root)
        const values = enumOf(subschema)
        const labels = enumLabelsOf(subschema)
        if (values && labels) {
            lines.push(`${path}: ${formatEnumValues(values, labels).join('|')}`)
        }
        walk(subschema, root, path, lines)
    }
}

function formatEnumValues(values, labels) {
    return values.map(value => {
        const label = labels?.[String(value)]
        return label ? `${value}(${label})` : value
    })
}

function enumOf(subschema) {
    if (subschema.enum) return subschema.enum
    if (subschema.type === 'array' && subschema.items?.enum) return subschema.items.enum
    return null
}

function enumLabelsOf(subschema) {
    return subschema['x-enumLabels'] || subschema.items?.['x-enumLabels'] || null
}

function resolve(node, root) {
    if (node?.$ref) {
        return {...resolveRef(node.$ref, root), ...withoutRef(node)}
    } else {
        return node
    }
}

function withoutRef(node) {
    const {$ref, ...rest} = node
    return rest
}

function resolveRef(ref, root) {
    const segments = ref.replace(/^#\//, '').split('/')
    return segments.reduce((current, segment) => current[segment], root)
}

module.exports = {valueLabelsFromSchema}
