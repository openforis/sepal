// Generic, recipe-agnostic generator for a compact path-first update manual.
// Walks a recipe's JSON Schema (resolving local $ref into $defs) to derive
// model-relative JSON Pointers for the editable fields, each annotated with a
// telegraphic hint (enum values with labels/const/type/range/description). A curated knowledge
// list then renders a field-guidance section pairing each fact's Purpose (what
// the field controls) with its Guidance (how to tune it); a warnings section
// follows for facts flagging high-cost / reliability hazards, and rule-derived
// constraints are appended last. Output is deterministic and byte-identical
// across calls: schema property iteration order is stable and no Set/Object
// ordering nondeterminism is introduced.

function recipeUpdateManual({schema, constraints, knowledge}) {
    const lines = []
    walk(schema, schema, '', lines)
    return [
        lines.join('\n'),
        '',
        guidanceSection(knowledge),
        '',
        warningsSection(knowledge),
        '',
        constraintsSection(constraints)
    ].join('\n')
}

function walk(schema, root, prefix, lines) {
    for (const key of Object.keys(schema.properties)) {
        const path = `${prefix}/${key}`
        const subschema = resolve(schema.properties[key], root)
        lines.push(`${path}: ${hintFor(subschema)}`)
        if (hasNestedProperties(subschema)) {
            walk(subschema, root, path, lines)
        }
    }
}

function hintFor(subschema) {
    const parts = []
    const enumValues = enumOf(subschema)
    if (enumValues) {
        parts.push(`enum ${formatEnumValues(enumValues, enumLabelsOf(subschema)).join('|')}`)
    } else if (subschema.const !== undefined) {
        parts.push(`const ${subschema.const}`)
    } else if (subschema.type) {
        parts.push(typeHint(subschema))
    }
    if (subschema.description) {
        parts.push(`— ${subschema.description}`)
    }
    return parts.join(' ')
}

function formatEnumValues(values, labels) {
    return values.map(value => {
        const label = labels?.[String(value)]
        return label ? `${value}(${label})` : value
    })
}

// enum directly on the subschema, or on array `items` (e.g. corrections,
// includedCloudMasking). Item-level enums are surfaced at the array path so the
// editor sees allowed members without indexed paths.
function enumOf(subschema) {
    if (subschema.enum) return subschema.enum
    if (subschema.type === 'array' && subschema.items?.enum) return subschema.items.enum
    return null
}

function enumLabelsOf(subschema) {
    return subschema['x-enumLabels'] || subschema.items?.['x-enumLabels'] || null
}

function typeHint(subschema) {
    if (isNumeric(subschema) && subschema.minimum !== undefined && subschema.maximum !== undefined) {
        return `${subschema.type} ${subschema.minimum}..${subschema.maximum}`
    } else {
        return subschema.type
    }
}

function isNumeric(subschema) {
    return subschema.type === 'integer' || subschema.type === 'number'
}

// Recurse only into object subschemas that declare their own `properties`.
// Array-of-object items (e.g. filters) are not recursed: the array path plus
// any item-level enum is enough, and indexed paths would be noise.
function hasNestedProperties(subschema) {
    return subschema.type === 'object' && subschema.properties !== undefined
}

// Resolves a single local $ref ("#/$defs/dates" → root.$defs.dates). oneOf/anyOf
// nodes (aoi) are left unresolved — surfaced as the node path plus description,
// not exploded per variant.
function resolve(node, root) {
    if (node.$ref) {
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

// Renders the curated knowledge list in list order (deterministic). One compact
// entry per fact: path(s), topic tags, guidance statements, then tradeoffs.
// inspectWhen/suggestions stay in the data for other consumers; the update
// manual keeps only what the editing specialist needs.
function guidanceSection(knowledge) {
    const lines = knowledge.map(factEntry)
    return ['Field guidance:', ...lines].join('\n')
}

function factEntry(fact) {
    const paths = fact.paths || [fact.path]
    const parts = [`${paths.join(', ')} [${fact.topics.join(', ')}]: Purpose: ${fact.purpose} Guidance: ${fact.guidance.join(' ')}`]
    if (fact.tradeoffs) {
        parts.push(`Tradeoff: ${fact.tradeoffs.join(' ')}`)
    }
    return parts.join(' ')
}

// Warnings are the high-cost / reliability hazards collected from facts that
// carry a non-empty warnings array. Each line carries the fact's path(s) so the
// editing specialist knows which field the hazard applies to.
function warningsSection(knowledge) {
    const lines = knowledge
        .filter(fact => fact.warnings && fact.warnings.length > 0)
        .map(warningEntry)
    return ['Warnings:', ...lines].join('\n')
}

function warningEntry(fact) {
    const paths = fact.paths || [fact.path]
    return `${paths.join(', ')}: ${fact.warnings.join(' ')}`
}

function constraintsSection(constraints) {
    const lines = constraints.map(constraint =>
        `${constraint.name} (${constraint.paths.join(', ')}): ${constraint.description}`)
    return ['Constraints:', ...lines].join('\n')
}

module.exports = {recipeUpdateManual}
