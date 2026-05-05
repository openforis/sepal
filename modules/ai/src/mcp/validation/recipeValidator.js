// Recipe validator entry point. Delegates to recipes/validate.js for any
// recipe registered through the new structure (recipes/<recipe>/index.js with
// schema + rules + getDefaults). Recipes without a `rules` field are not
// validated — the chat can still reference them but no constraints are
// enforced until they are migrated to the new structure.

const log = require('#sepal/log').getLogger('validation')
const {validate: validateNewRecipe} = require('../../recipes/validate')

/**
 * Deep-merge defaults into a model, only filling in missing keys.
 * User-provided arrays replace defaults entirely (no array merging).
 */
const deepMergeDefaults = (defaults, overrides) => {
    if (overrides === undefined || overrides === null) {
        return defaults
    }
    if (typeof defaults !== 'object' || Array.isArray(defaults)) {
        return overrides
    }
    if (typeof overrides !== 'object' || Array.isArray(overrides)) {
        return overrides
    }
    const result = {...defaults}
    for (const key of Object.keys(overrides)) {
        if (key in result && typeof result[key] === 'object' && !Array.isArray(result[key])
            && typeof overrides[key] === 'object' && !Array.isArray(overrides[key])
            && overrides[key] !== null) {
            result[key] = deepMergeDefaults(result[key], overrides[key])
        } else {
            result[key] = overrides[key]
        }
    }
    return result
}

const createRecipeValidator = ({registry}) => {

    const validateModel = ({type, model}) => {
        const schema = registry.getSchema(type)
        if (!schema || !schema.rules) {
            return null
        }
        const errors = validateNewRecipe(schema, model)
            .map(e => `${e.path} ${e.message}`)
        if (errors.length > 0) {
            log.debug(`Validation failed for ${type}: ${errors.join('; ')}`)
            return errors
        }
        return null
    }

    const applyDefaults = ({type, model}) => {
        const schema = registry.getSchema(type)
        if (schema && schema.getDefaults) {
            return deepMergeDefaults(schema.getDefaults(), model)
        }
        return model
    }

    return {validateModel, applyDefaults}
}

module.exports = {createRecipeValidator, deepMergeDefaults}
