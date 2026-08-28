import {recipeType} from '#sepal/recipe/recipeTypeRegistry'

// The persisted type and the policy are written as literals: a production rename must not make this pass.
const declaration = () => recipeType('CCDC').imageOutput

const derive = bandNames => declaration()?.derive?.({observation: {bandNames}})

describe('the registered CCDC output declaration', () => {
    it('is intrinsic, because its bands are a property of the running image', () => {
        expect(declaration()).toEqual(expect.objectContaining({kind: 'INTRINSIC'}))
    })

    // CCDC exports every band with sample: modules/task/src/tasks/ccdcAssetExport.js and
    // lib/js/ee/src/timeSeries/temporalSegmentation.js both set {'.default': 'sample'}, because its array
    // bands cannot be pyramided by averaging.
    it('requires sample for every observed band, in observed order', () => {
        expect(derive(['tStart', 'tEnd', 'ndvi_coefs', 'ndvi_rmse'])).toEqual({
            bands: [
                {name: 'tStart', pyramidingPolicy: 'sample'},
                {name: 'tEnd', pyramidingPolicy: 'sample'},
                {name: 'ndvi_coefs', pyramidingPolicy: 'sample'},
                {name: 'ndvi_rmse', pyramidingPolicy: 'sample'}
            ],
            evidence: []
        })
    })

    // Names are copied into the schema; the policy is what must not depend on them. A declaration that
    // recognised band names would be inferring output behavior from the model rather than declaring it -
    // and `class` is exactly the name the classification policy maps to `mode`.
    it('requires sample whatever the observed names happen to be', () => {
        expect(derive(['class', 'change', 'alpha', 'future_band'])).toEqual({
            bands: [
                {name: 'class', pyramidingPolicy: 'sample'},
                {name: 'change', pyramidingPolicy: 'sample'},
                {name: 'alpha', pyramidingPolicy: 'sample'},
                {name: 'future_band', pyramidingPolicy: 'sample'}
            ],
            evidence: []
        })
    })

    it('describes an empty observation as an empty band list', () => {
        expect(derive([])).toEqual({bands: [], evidence: []})
    })

    it('does not modify the observation it was given', () => {
        const observation = {bandNames: ['tStart', 'ndvi_coefs']}
        const before = JSON.stringify(observation)
        const derived = declaration()?.derive?.({observation})

        expect(derived).toEqual({
            bands: [
                {name: 'tStart', pyramidingPolicy: 'sample'},
                {name: 'ndvi_coefs', pyramidingPolicy: 'sample'}
            ],
            evidence: []
        })
        expect(JSON.stringify(observation)).toEqual(before)
        expect(derived.bands).not.toBe(observation.bandNames)
    })
})
