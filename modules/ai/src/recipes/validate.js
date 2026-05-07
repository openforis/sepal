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

// Cache compiled validators by recipe id.
const compiled = {}

const compile = recipe => {
    if (!compiled[recipe.id]) {
        const $id = recipe.parameterSchema.$id
        compiled[recipe.id] = ($id && ajv.getSchema($id)) || ajv.compile(recipe.parameterSchema)
    }
    return compiled[recipe.id]
}

const validate = (recipe, model) => {
    const errors = []

    const validateSchema = compile(recipe)
    if (!validateSchema(model)) {
        for (const e of validateSchema.errors) {
            errors.push({
                path: e.instancePath || '/',
                message: e.message
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
