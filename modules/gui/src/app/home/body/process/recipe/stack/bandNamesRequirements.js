import _ from 'lodash'

import {DUPLICATE_BAND_NAME, INCOMPLETE_IMAGE_OUTPUT} from '#sepal/recipe/output/diagnostic'
import {SUPPORTED, unsupported} from '#sepal/recipe/requirement/verdict'
import {stackMappingRefusals, unresolvedBands} from '#sepal/recipe/type/stack'
import {msg} from '~/translate'

import {invalidBandNameFormat} from './bandNameFormat'
import {INVALID_FORMAT} from './bandNamesProblems'

// What Band names says of each band before its names are applied, and holds Apply for: the names as the recipe holds
// them, refused as the declaration refuses them (stackMappingRefusals) or as the editor's format rule does, and each
// band of an input whose saved names cannot be told apart, until the user names it (unresolvedBands). A name the
// declaration refuses as already taken is said of every band holding it, for the user to see which to rename. A panel's
// values are judged as committing them would name the bands (committedBandNames, through the applied derivation), over
// the recipe as it stands, and again at submission (localCandidate.js). What was applied is its output read's to refuse:
// this holds nothing.

export const BAND_NAMES = {id: 'bandNames', label: 'process.stack.panel.bandNames.button'}

export const BAND_NAMES_REQUIREMENT = 'STACK_BAND_NAMES'

export const UNRESOLVED_BAND = 'UNRESOLVED_BAND'

// The item a band is in Band names: its input's and its own id.
export const bandNameItemId = (imageId, id) => `${imageId}/${id}`

export const bandNamesRequirement = {
    id: BAND_NAMES_REQUIREMENT,
    section: BAND_NAMES,
    localFacts: recipe => ({bands: namedBands(recipe.model)}),
    items: ({bands}) => bands,
    requirement: {
        id: BAND_NAMES_REQUIREMENT,
        evaluate: ({code}) => code ? unsupported({code}) : {status: SUPPORTED},
        describe: ({code}) => ({message: msg(`process.stack.panel.bandNames.${MESSAGES[code]}`), details: []})
    },
    editor: {panel: BAND_NAMES.id, input: 'bandNames'},
    operations: []
}

const namedBands = model => {
    const unresolved = unresolvedBands(model)
    const refusals = stackMappingRefusals(model)
    const duplicated = new Set(refusals.filter(({code}) => code === DUPLICATE_BAND_NAME).map(({path}) => _.get({model}, path)))
    return [
        ...(model?.bandNames?.bandNames || []).flatMap((entry, entryIndex) => unresolved.some(({imageId}) => imageId === entry.imageId)
            ? []
            : (entry.bands || []).map((band, bandIndex) => {
                const path = ['model', 'bandNames', 'bandNames', entryIndex, 'bands', bandIndex]
                const refusal = refusals.find(refusal => _.isEqual(refusal.path.slice(0, path.length), path))
                return item(entry.imageId, band.id, path, codeOf(band, refusal, duplicated))
            })),
        ...unresolved.map(({imageId, id}) => item(imageId, id, ['model', 'inputImagery', 'images'], UNRESOLVED_BAND))
    ]
}

const codeOf = ({outputName}, refusal, duplicated) => {
    if (invalidBandNameFormat(outputName)) {
        return INVALID_FORMAT
    }
    return duplicated.has(outputName) ? DUPLICATE_BAND_NAME : refusal?.code
}

const item = (imageId, id, path, code) => ({id: bandNameItemId(imageId, id), path, label: id, facts: {code}})

const MESSAGES = {
    [INVALID_FORMAT]: 'invalidFormat',
    [INCOMPLETE_IMAGE_OUTPUT]: 'problem.blank',
    [UNRESOLVED_BAND]: 'unresolved',
    [DUPLICATE_BAND_NAME]: 'duplicateBand'
}
