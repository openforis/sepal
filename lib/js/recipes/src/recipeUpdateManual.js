// Generic, recipe-agnostic generator for a compact path-first update manual.
// Walks a recipe's JSON Schema (resolving local $ref into $defs) to derive
// model-relative JSON Pointers for the editable fields, each annotated with a
// telegraphic hint (enum/const/type/range/description). Rule-derived
// constraints are appended as a section. Output is deterministic and
// byte-identical across calls: schema property iteration order is stable and
// no Set/Object ordering nondeterminism is introduced.

function recipeUpdateManual({schema, constraints}) {
    const lines = []
    walk(schema, schema, '', lines)
    return [lines.join('\n'), '', constraintsSection(constraints)].join('\n')
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
        parts.push(`enum ${enumValues.join('|')}`)
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

// enum directly on the subschema, or on array `items` (e.g. corrections,
// includedCloudMasking). Item-level enums are surfaced at the array path so the
// editor sees allowed members without indexed paths.
function enumOf(subschema) {
    if (subschema.enum) return subschema.enum
    if (subschema.type === 'array' && subschema.items?.enum) return subschema.items.enum
    return null
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
        return resolveRef(node.$ref, root)
    } else {
        return node
    }
}

function resolveRef(ref, root) {
    const segments = ref.replace(/^#\//, '').split('/')
    return segments.reduce((current, segment) => current[segment], root)
}

function constraintsSection(constraints) {
    const lines = constraints.map(constraint =>
        `${constraint.name} (${constraint.paths.join(', ')}): ${constraint.description}`)
    return ['Constraints:', ...lines].join('\n')
}

module.exports = {recipeUpdateManual}
