// Validation engine for the new recipe schemas.
//
// A recipe is the object exported by recipes/<recipe>/index.js, with shape:
//   {id, name, description, schema, rules, getDefaults}
//
// validate(recipe, model) runs:
//   1. JSON Schema validation (ajv with formats + cross-file $ref resolution)
//   2. Cross-field rule validation (rules.js)
// and returns a flat array of {path, message} errors. Empty array means valid.

const Ajv = require('ajv/dist/2020')
const addFormats = require('ajv-formats')
const path = require('path')
const fs = require('fs')
const {bundleSchema} = require('./bundleSchema')

// Single shared ajv instance, with all schemas pre-loaded by $id.
// Cross-file $refs (e.g. '../shared/aoi.schema.json') are resolved by ajv's
// internal id index after addSchema().
const ajv = new Ajv({strict: false, allErrors: true})
addFormats(ajv)

// Pre-load all *.schema.json under recipes/. Each carries its $id; ajv indexes
// by $id, so $refs to other schema files resolve correctly regardless of the
// $ref's relative path string.
const recipesDir = __dirname
const isSchemaFile = name => name === 'schema.json' || name.endsWith('.schema.json')
for (const dirent of fs.readdirSync(recipesDir, {withFileTypes: true, recursive: true})) {
    if (dirent.isFile() && isSchemaFile(dirent.name)) {
        const filePath = path.join(dirent.parentPath || dirent.path, dirent.name)
        const schema = JSON.parse(fs.readFileSync(filePath, 'utf8'))
        if (schema.$id && !ajv.getSchema(schema.$id)) {
            ajv.addSchema(schema)
        }
    }
}

const compiled = {}
const bundledByRecipe = {}

const compile = recipe => {
    if (!compiled[recipe.id]) {
        const $id = recipe.parameterSchema.$id
        compiled[recipe.id] = ($id && ajv.getSchema($id)) || ajv.compile(recipe.parameterSchema)
    }
    return compiled[recipe.id]
}

const getBundled = recipe => {
    if (!bundledByRecipe[recipe.id]) {
        bundledByRecipe[recipe.id] = bundleSchema(recipe.parameterSchema)
    }
    return bundledByRecipe[recipe.id]
}

// Walk a JSON-pointer fragment ("#/$defs/constraint/properties/band") through
// a fully-local (bundled) schema, transparently following local $refs. Returns
// null if any segment is missing — caller falls back to the default message.
const resolvePointer = (schema, pointer) => {
    if (!pointer || !pointer.startsWith('#/')) return null
    const parts = pointer.slice(2).split('/').map(p => p.replace(/~1/g, '/').replace(/~0/g, '~'))
    let node = schema
    for (const part of parts) {
        if (!node || typeof node !== 'object') return null
        if (node.$ref && node.$ref.startsWith('#/')) {
            node = resolvePointer(schema, node.$ref)
            if (!node) return null
        }
        node = node[part]
    }
    while (node && typeof node === 'object' && node.$ref && node.$ref.startsWith('#/')) {
        node = resolvePointer(schema, node.$ref)
    }
    return node
}

const formatList = values => values.map(v => JSON.stringify(v)).join(', ')

const enrichMessage = (e, bundled) => {
    if (e.keyword === 'additionalProperties') {
        return `${e.message} (got '${e.params.additionalProperty}')`
    }
    if (e.keyword === 'enum' && Array.isArray(e.params.allowedValues)) {
        return `${e.message} (allowed: ${formatList(e.params.allowedValues)})`
    }
    if (e.keyword === 'const') {
        return `${e.message} (must be: ${JSON.stringify(e.params.allowedValue)})`
    }
    if (e.keyword === 'required' && bundled && e.params.missingProperty) {
        const propPointer = e.schemaPath.replace(/\/required$/, `/properties/${e.params.missingProperty}`)
        const propSchema = resolvePointer(bundled, propPointer)
        if (propSchema && typeof propSchema === 'object') {
            if (propSchema.const !== undefined) {
                return `${e.message} (must be: ${JSON.stringify(propSchema.const)})`
            }
            if (Array.isArray(propSchema.enum)) {
                return `${e.message} (allowed: ${formatList(propSchema.enum)})`
            }
        }
    }
    return e.message
}

const validate = (recipe, model) => {
    const errors = []

    const validateSchema = compile(recipe)
    if (!validateSchema(model)) {
        const bundled = getBundled(recipe)
        for (const e of validateSchema.errors) {
            errors.push({
                path: e.instancePath || '/',
                message: enrichMessage(e, bundled)
            })
        }
    }

    if (recipe.rules) {
        for (const rule of recipe.rules) {
            errors.push(...rule.validate(model))
        }
    }

    return errors
}

module.exports = {validate}
