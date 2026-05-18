// Browser-safe: no fs / no path. Recipe specs follow the shape in
// DESIGN_chat_specialists_v2.md §7. LLM-facing model contract + the stored ->
// effective projection are described in ./README.md.

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

function toEffectiveModel(id, model) {
    const spec = getRecipeSpec(id)
    if (!spec?.toEffectiveModel) return model
    return spec.toEffectiveModel(model)
}

module.exports = {
    listRecipeSpecs,
    getRecipeSpec,
    getRecipeSchema,
    getRecipeDefaults,
    validateRecipe,
    toEffectiveModel
}
