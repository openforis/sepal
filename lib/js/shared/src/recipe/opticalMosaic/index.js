const schema = require('./schema.json')
const {rules} = require('./rules')
const {getDefaults} = require('./defaults')
const {createRecipeValidator} = require('../validate')

const spec = {
    id: 'MOSAIC',
    name: 'Optical Mosaic',
    description: 'Cloud-free composite from optical satellites (LS 4-9, S2). Per-scene corrections + per-pixel cloud/shadow/snow mask -> reduce surviving obs per pixel.',
    schema,
    rules,
    defaultModel: getDefaults,
    validate
}

const validator = createRecipeValidator(spec)

function validate(model) {
    return validator.validate(model)
}

module.exports = spec
