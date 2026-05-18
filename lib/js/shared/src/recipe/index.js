// Browser-safe: no fs / no path. Recipe specs follow the shape in
// DESIGN_chat_specialists_v2.md §7. promptFacts / fragmentsForEdit are
// deferred (see modules/ai/PUNCH_LIST.md).

const opticalMosaic = require('./opticalMosaic')

const REGISTRY = new Map([[opticalMosaic.id, opticalMosaic]])

function listRecipeSpecs() {
    return [...REGISTRY.values()]
}

function getRecipeSpec(id) {
    return REGISTRY.get(id) || null
}

function getRecipeSchema(id) {
    return getRecipeSpec(id)?.schema || null
}

function getRecipeDefaults(id) {
    return getRecipeSpec(id)?.defaultModel() || null
}

function validateRecipe(id, model) {
    const spec = getRecipeSpec(id)
    if (!spec) {
        return [{path: '', message: `Unknown recipe type: ${id}`, rule: 'unknownType'}]
    }
    return spec.validate(model)
}

module.exports = {
    listRecipeSpecs,
    getRecipeSpec,
    getRecipeSchema,
    getRecipeDefaults,
    validateRecipe
}
