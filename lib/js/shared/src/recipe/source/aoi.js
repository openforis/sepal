import {INCOMPLETE_REFERENCE, MALFORMED_REFERENCE} from './diagnostic.js'
import {diagnosticResult, idResults, isBlank, isPlainObject, isUnselected, readAt} from './extract.js'
import {assetReference, recipeReference} from './reference.js'

// The AOI model, shared by every recipe type that has one.
//
// An AOI decides output extent and geometry, not image semantics, so it is one role wherever it appears.
// The persisted vocabulary is the AOI panel's, not the canonical one
// (modules/gui/src/app/home/body/process/recipe/mosaic/panels/aoi/aoiModel.js): a recipe-backed AOI is
// stored as type 'RECIPE', and the country and custom-table AOIs as 'EE_TABLE', which Earth Engine reads as
// a FeatureCollection asset - an asset reference even though it is not an image. This lives here rather
// than in a recipe type because several types persist exactly this model, and rather than in reference.js
// because it is one model's history, not the canonical contract.

export const AOI = 'AOI'

// A Map, because the key is a string read out of a persisted model and an inherited member such as
// `toString` must not answer as a declared section.
const AOI_REFERENCE = new Map([
    ['RECIPE', recipeReference],
    ['ASSET', assetReference],
    ['EE_TABLE', assetReference]
])

// AOI sections that are geometry or a self-reference, with nothing external to resolve.
const AOI_WITHOUT_REFERENCE = ['POLYGON', 'POINT', 'ASSET_BOUNDS']

const aoiResults = (aoi, path) => {
    if (isUnselected(aoi)) {
        return []
    }
    if (!isPlainObject(aoi)) {
        return [diagnosticResult({code: MALFORMED_REFERENCE, role: AOI, path})]
    }
    if (isBlank(aoi.type)) {
        return [diagnosticResult({code: INCOMPLETE_REFERENCE, role: AOI, path})]
    }
    if (AOI_WITHOUT_REFERENCE.includes(aoi.type)) {
        return []
    }
    const toReference = AOI_REFERENCE.get(aoi.type)
    return toReference
        ? idResults({id: aoi.id, toReference, role: AOI, path, required: true})
        : [diagnosticResult({code: MALFORMED_REFERENCE, role: AOI, path})]
}

export const fromAoi = ({model, keys}) => {
    const {value, malformedPath} = readAt(model, keys)
    return malformedPath
        ? [diagnosticResult({code: MALFORMED_REFERENCE, role: AOI, path: malformedPath})]
        : aoiResults(value, ['model', ...keys])
}
