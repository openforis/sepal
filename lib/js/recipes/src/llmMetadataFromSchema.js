// Projects JSON-Schema conditional requirements into LLM-oriented constraint
// metadata, in the same {name, description, paths} shape as rule-derived
// constraints. Generic: no recipe-type knowledge. It walks object `properties`
// (resolving local $ref into $defs), and at each object reads conditional
// `allOf: [{if, then}]` entries (and a node-level if/then) whose `then.required`
// lists sibling fields. Each conditional becomes a constraint coupling the
// trigger field's path with its required companion paths, so a focus on either
// pulls in the rest. Array `items` are not walked — indexed paths aren't
// addressable focus paths.
//
// Fresh objects each call so callers can't mutate shared metadata.

function llmMetadataFromSchema(schema) {
    const constraints = []
    walk(schema, schema, '', constraints)
    return {constraints}
}

function walk(node, root, prefix, constraints) {
    const resolved = resolve(node, root)
    conditionalsOf(resolved).forEach(conditional => {
        const constraint = constraintFrom(conditional, prefix)
        if (constraint) constraints.push(constraint)
    })
    if (resolved.properties) {
        for (const key of Object.keys(resolved.properties)) {
            walk(resolved.properties[key], root, `${prefix}/${key}`, constraints)
        }
    }
}

function conditionalsOf(node) {
    const fromAllOf = (node.allOf || []).filter(entry => entry.if && entry.then)
    const nodeLevel = node.if && node.then ? [{if: node.if, then: node.then}] : []
    return [...fromAllOf, ...nodeLevel]
}

function constraintFrom({if: condition, then}, prefix) {
    const required = then.required || []
    if (!required.length) return null
    const triggers = triggerFields(condition)
    if (!triggers.length) return null
    const trigger = triggers[0]
    const value = triggerValue(condition, trigger)
    const paths = distinct([...triggers, ...required].map(field => `${prefix}/${field}`))
    const base = dotted(prefix)
    const triggerLabel = base ? `${base}.${trigger}` : trigger
    return {
        name: `schema:${triggerLabel}${value === undefined ? '' : `=${value}`}`,
        description: `${triggerLabel} ${value === undefined ? 'set' : `contains ${value}`} -> requires ${required.join(', ')}`,
        paths
    }
}

function triggerFields(condition) {
    return distinct([...Object.keys(condition.properties || {}), ...(condition.required || [])])
}

function triggerValue(condition, trigger) {
    const property = condition.properties?.[trigger]
    return property?.contains?.const ?? property?.const
}

function dotted(prefix) {
    return prefix.replace(/^\//, '').replace(/\//g, '.')
}

function distinct(values) {
    return [...new Set(values)]
}

function resolve(node, root) {
    return node.$ref ? resolveRef(node.$ref, root) : node
}

function resolveRef(ref, root) {
    return ref.replace(/^#\//, '').split('/').reduce((current, segment) => current[segment], root)
}

module.exports = {llmMetadataFromSchema}
