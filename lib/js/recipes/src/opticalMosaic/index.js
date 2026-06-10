import {recipeUpdateManual} from '../recipeUpdateManual.js'
import {createRecipeValidator} from '../validate.js'
import {getDefaults} from './defaults.js'
import {getDescribeFacts, getEditFacts, getSelectionFacts} from './facts.js'
import {getHandles} from './handles.js'
import {getKnowledge} from './knowledge.js'
import {getLlmMetadata} from './llmMetadata.js'
import {rules} from './rules.js'
import schema from './schema.json' with {type: 'json'}
import {toEffectiveModel} from './toEffectiveModel.js'

const {validate} = createRecipeValidator({schema, rules})

const id = 'MOSAIC'
const name = 'Optical Mosaic'
const description = 'Cloud-masked composite from optical satellites (Landsat 4-9, Sentinel-2). Per-scene corrections + per-pixel cloud/shadow/snow mask -> reduce surviving observations per pixel.'
const defaultModel = getDefaults
const selectionFacts = getSelectionFacts
const describeFacts = getDescribeFacts
const editFacts = getEditFacts
const llmMetadata = getLlmMetadata
const knowledge = getKnowledge
const handles = getHandles
const updateManual = () => recipeUpdateManual({schema, constraints: getLlmMetadata().constraints, knowledge: getKnowledge()})

export {
    defaultModel,
    describeFacts,
    description,
    editFacts,
    handles,
    id,
    knowledge,
    llmMetadata,
    name,
    rules,
    schema,
    selectionFacts,
    toEffectiveModel,
    updateManual,
    validate
}
