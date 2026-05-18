const schema = require('./schema.json')
const {rules} = require('./rules')
const {getDefaults} = require('./defaults')
const {toEffectiveModel} = require('./toEffectiveModel')
const {createRecipeValidator} = require('../validate')

const {validate} = createRecipeValidator({schema, rules})

module.exports = {
    id: 'MOSAIC',
    name: 'Optical Mosaic',
    description: 'Cloud-free composite from optical satellites (LS 4-9, S2). Per-scene corrections + per-pixel cloud/shadow/snow mask -> reduce surviving obs per pixel.',
    schema,
    rules,
    defaultModel: getDefaults,
    toEffectiveModel,
    validate
}
