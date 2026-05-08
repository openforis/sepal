// Recipe validator entry point. Delegates to recipes/validate.js for any
// recipe registered through the new structure (recipes/<recipe>/index.js with
// schema + rules + getDefaults). Recipes without a `rules` field are not
// validated — the chat can still reference them but no constraints are
// enforced until they are migrated to the new structure.

const log = require('#sepal/log').getLogger('validation')
const {validate: validateNewRecipe} = require('../../recipes/validate')

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

    return {validateModel}
}

module.exports = {createRecipeValidator}
