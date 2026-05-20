const schema = require('./schema.json')
const {rules} = require('./rules')
const {getDefaults} = require('./defaults')
const {toEffectiveModel} = require('./toEffectiveModel')
const {getSelectionFacts, getDescribeFacts, getEditFacts} = require('./facts')
const {getLlmMetadata} = require('./llmMetadata')
const {getKnowledge} = require('./knowledge')
const {recipeUpdateManual} = require('../recipeUpdateManual')
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
    selectionFacts: getSelectionFacts,
    describeFacts: getDescribeFacts,
    editFacts: getEditFacts,
    llmMetadata: getLlmMetadata,
    knowledge: getKnowledge,
    updateManual: () => recipeUpdateManual({schema, constraints: getLlmMetadata().constraints, knowledge: getKnowledge()}),
    validate
}
