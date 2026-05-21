const schema = require('./schema.json')
const {rules} = require('./rules')
const {getDefaults} = require('./defaults')
const {toEffectiveModel} = require('./toEffectiveModel')
const {getSelectionFacts, getDescribeFacts, getEditFacts} = require('./facts')
const {getLlmMetadata} = require('./llmMetadata')
const {getKnowledge} = require('./knowledge')
const {recipeUpdateManual} = require('../recipeUpdateManual')
const {valueLabelsFromSchema} = require('../valueLabelsFromSchema')
const {createRecipeValidator} = require('../validate')

const {validate} = createRecipeValidator({schema, rules})

module.exports = {
    id: 'MOSAIC',
    name: 'Optical Mosaic',
    description: 'Cloud-masked composite from optical satellites (Landsat 4-9, Sentinel-2). Per-scene corrections + per-pixel cloud/shadow/snow mask -> reduce surviving observations per pixel.',
    schema,
    rules,
    defaultModel: getDefaults,
    toEffectiveModel,
    selectionFacts: getSelectionFacts,
    describeFacts: getDescribeFacts,
    editFacts: getEditFacts,
    llmMetadata: getLlmMetadata,
    knowledge: getKnowledge,
    valueLabels: () => valueLabelsFromSchema(schema),
    updateManual: () => recipeUpdateManual({schema, constraints: getLlmMetadata().constraints, knowledge: getKnowledge()}),
    validate
}
