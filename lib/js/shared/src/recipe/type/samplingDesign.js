import {defineRecipeType} from '../defineRecipeType.js'
import {isStratificationSkipped} from '../samplingDesign/stratificationSkip.js'
import {fromAoi} from '../source/aoi.js'
import {INCOMPLETE_REFERENCE, MALFORMED_REFERENCE} from '../source/diagnostic.js'
import {diagnosticResult, fromId, isBlank, isPlainObject, isUnselected} from '../source/extract.js'
import {assetReference, recipeReference} from '../source/reference.js'

// A sampling design draws samples over its AOI, stratified by one source
// (lib/js/ee/src/samplingDesign/samplingDesign.js and samplingDesign/stratificationImage.js).
//
// The stratification record persists `recipeId` AND `assetId` unconditionally
// (recipe/samplingDesign/panels/stratification/stratificationModel.js valuesToModel), so a saved model
// normally carries the one it is not using. `type` alone decides which is live.
//
// That makes the type a value to validate rather than a branch to fall out of. Treating everything that is
// not RECIPE as ASSET would read whichever id survived on a model whose type went missing or unrecognized -
// silently stratifying the design on a source the user abandoned. This is deliberately stricter than
// stratificationImage.js, which does take the else branch: execution answers "which image", while this
// answers "which sources does this recipe depend on", and an unrunnable recipe must not be reported as one
// depending on a stale asset.
//
// An unstratified design resolves neither. isStratificationSkipped is the shared policy the GUI, the task
// boundary and the Earth Engine layer already answer with, and it recognizes both the boolean flag and the
// legacy form-toggle array - so this cannot drift into a different answer than the code that draws the
// samples. It is decided before the type is read, exactly as stratificationImage.js returns its constant
// image before looking at one.
//
// The AOI is independent: a skipped design is still clipped.

export const STRATIFICATION = 'STRATIFICATION'

// A Map, because the key is a string read out of a persisted model and an inherited member such as
// `toString` must not answer as a known stratification kind.
const STRATIFICATION_SOURCE = new Map([
    ['RECIPE', {key: 'recipeId', toReference: recipeReference}],
    ['ASSET', {key: 'assetId', toReference: assetReference}]
])

const fromStratification = model => {
    const stratification = model.stratification
    const path = ['model', 'stratification']
    if (isUnselected(stratification)) {
        return []
    }
    if (!isPlainObject(stratification)) {
        return [diagnosticResult({code: MALFORMED_REFERENCE, role: STRATIFICATION, path})]
    }
    if (isStratificationSkipped(stratification)) {
        return []
    }
    if (isBlank(stratification.type)) {
        return [diagnosticResult({code: INCOMPLETE_REFERENCE, role: STRATIFICATION, path})]
    }
    const source = STRATIFICATION_SOURCE.get(stratification.type)
    return source
        ? fromId({
            model,
            keys: ['stratification', source.key],
            toReference: source.toReference,
            role: STRATIFICATION,
            requiredWhenPresent: true
        })
        : [diagnosticResult({code: MALFORMED_REFERENCE, role: STRATIFICATION, path})]
}

export default defineRecipeType({
    type: 'SAMPLING_DESIGN',
    directSources: model => [
        ...fromAoi({model, keys: ['aoi']}),
        ...fromStratification(model)
    ]
})
