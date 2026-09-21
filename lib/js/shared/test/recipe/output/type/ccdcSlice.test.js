import {inheritedSchemaRole} from '#sepal/recipe/output/provider'
import {resolveImageOutput} from '#sepal/recipe/output/resolveImageOutput'
import {recipeType} from '#sepal/recipe/recipeTypeRegistry'
import {buildRecipeDependencyGraph} from '#sepal/recipe/source/dependencyGraph'
import {sliceOperation, sliceOutputBands} from '#sepal/recipe/type/ccdcSlice'

// CCDC Slice turns a segments image into scalar bands for one date or one range. WHICH bands depends on the
// operation the model selects, and the expectations below follow lib/js/ee/src/timeSeries/ccdcSlice.js and
// the `sliceBandNames` it selects through.
//
// Persisted types and the role are literals: a production rename must not make this pass.
const declaration = () => recipeType('CCDC_SLICE').imageOutput

const SEGMENTS = ['tStart', 'tEnd', 'tBreak', 'numObs', 'changeProb', 'ndvi_coefs', 'ndvi_rmse', 'ndvi_magnitude']

const model = ({dateType = 'SINGLE', gapStrategy = 'MASK', harmonics = 3} = {}) =>
    ({date: {dateType}, options: {gapStrategy, harmonics}})

describe('the registered CCDC_SLICE output declaration', () => {
    it('transforms its literal PRIMARY_IMAGE role', () => {
        expect(declaration().role).toBe('PRIMARY_IMAGE')
    })

    // Slice changes what its input is - arrays become scalars - so nothing may inherit the input's schema
    // through it. That is what keeps a wrapper-inheritance rule from treating Slice as a pass-through.
    it('does not preserve its input, so no schema is inherited through it', () => {
        expect(inheritedSchemaRole(declaration())).toBeUndefined()
    })
})

describe('the operation a model selects', () => {
    it('is a range average whenever the date type says so, whatever the gap strategy', () => {
        expect(sliceOperation(model({dateType: 'RANGE', gapStrategy: 'MASK'}))).toBe('RANGE')
    })

    it('is an interpolation for a single date with that gap strategy', () => {
        expect(sliceOperation(model({gapStrategy: 'INTERPOLATE'}))).toBe('INTERPOLATE')
    })

    it('is a segment slice otherwise, including for a model that says nothing', () => {
        expect(sliceOperation(model())).toBe('SEGMENT')
        expect(sliceOperation(undefined)).toBe('SEGMENT')
    })
})

describe('slicing one segment', () => {
    it('emits values, coefficients, residuals and timing, in the order the operation adds them', () => {
        expect(sliceOutputBands(SEGMENTS, model())).toEqual([
            'ndvi',
            'ndvi_intercept', 'ndvi_slope',
            'ndvi_phase_1', 'ndvi_amplitude_1',
            'ndvi_phase_2', 'ndvi_amplitude_2',
            'ndvi_phase_3', 'ndvi_amplitude_3',
            'ndvi_rmse', 'ndvi_magnitude', 'ndvi_breakConfidence',
            'tStart', 'tEnd', 'tBreak', 'numObs', 'changeProb'
        ])
    })

    // The operation emits phase and amplitude for three harmonics whatever the option says; only the values
    // it slices follow it.
    it('emits three harmonics whatever harmonics is set to', () => {
        expect(sliceOutputBands(SEGMENTS, model({harmonics: 0})))
            .toEqual(sliceOutputBands(SEGMENTS, model({harmonics: 3})))
    })
})

describe('interpolating between segments', () => {
    const interpolated = harmonics => sliceOutputBands(SEGMENTS, model({gapStrategy: 'INTERPOLATE', harmonics}))

    it('leads with the timing bands, then one group per measure', () => {
        expect(interpolated(1)).toEqual([
            'tStart', 'tEnd', 'tBreak', 'numObs', 'changeProb',
            'ndvi',
            'ndvi_rmse', 'ndvi_magnitude', 'ndvi_breakConfidence',
            'ndvi_intercept', 'ndvi_slope',
            'ndvi_phase_1', 'ndvi_amplitude_1'
        ])
    })

    // Asking for no harmonics produces no harmonic bands. Advertising them was the defect this fixes.
    it('emits no harmonic bands when none were asked for', () => {
        expect(interpolated(0).filter(band => band.includes('phase') || band.includes('amplitude'))).toEqual([])
    })

    it('emits three harmonics when the option is missing', () => {
        expect(interpolated(undefined).filter(band => band.startsWith('ndvi_phase')))
            .toEqual(['ndvi_phase_1', 'ndvi_phase_2', 'ndvi_phase_3'])
    })
})

describe('averaging over a range', () => {
    it('emits what interpolation does, following its own harmonics', () => {
        expect(sliceOutputBands(SEGMENTS, model({dateType: 'RANGE', harmonics: 2})))
            .toEqual(sliceOutputBands(SEGMENTS, model({gapStrategy: 'INTERPOLATE', harmonics: 2})))
    })
})

describe('a source that fits no measure', () => {
    it('yields only the timing bands it carries', () => {
        expect(sliceOutputBands(['tStart', 'nbr_rmse'], model())).toEqual(['tStart'])
    })

    it('yields nothing from nothing', () => {
        expect(sliceOutputBands([], model())).toEqual([])
        expect(sliceOutputBands(undefined, model())).toEqual([])
    })
})

describe('resolving CCDC_SLICE over CCDC through the registry', () => {
    const slice = {
        id: 'slice-1',
        type: 'CCDC_SLICE',
        model: {source: {type: 'RECIPE_REF', id: 'ccdc-1'}, ...model({gapStrategy: 'INTERPOLATE', harmonics: 1})}
    }
    const ccdc = {id: 'ccdc-1', type: 'CCDC', model: {}}
    const graph = buildRecipeDependencyGraph({
        rootRecipe: slice,
        recipesById: new Map([[slice.id, slice], [ccdc.id, ccdc]])
    })
    const resolved = () => resolveImageOutput({
        graph,
        declarationFor: recipe => recipeType(recipe.type)?.imageOutput,
        observationFor: ({type, id}) => (type === 'RECIPE_REF' && id === 'ccdc-1'
            ? {bands: SEGMENTS.map(name => ({name, dataType: {arrayDimensions: 1}}))}
            : undefined)
    })

    it('keeps the slice as the execution reference', () => {
        expect(resolved().description.executionReference).toEqual({type: 'RECIPE_REF', id: 'slice-1'})
    })

    it('describes the bands its own operation produces, all scalar', () => {
        const bands = resolved().description.output.bands
        expect(bands.map(({name}) => name)).toEqual(sliceOutputBands(SEGMENTS, slice.model))
        expect(bands.every(({dataType}) => dataType.arrayDimensions === 0)).toBe(true)
    })

    // CCDC's export policy exists for its arrays. A slice has none, so it inherits no policy from CCDC.
    it('carries no export policy over from the source', () => {
        expect(resolved().description.output.bands.every(({pyramidingPolicy}) => pyramidingPolicy === undefined))
            .toBe(true)
    })
})

describe('the segment-source declarations a reader of segments consults', () => {
    it('let CCDC state its date representation and that its base bands are selectable', () => {
        const {segmentSource} = recipeType('CCDC')
        expect(segmentSource.dateFormat({ccdcOptions: {dateFormat: 2}})).toBe(2)
        expect(segmentSource.selectableBaseBands).toBe(true)
    })

    // The base band names a reader derives from an asset are not band names on it, and the date
    // representation belongs to the asset rather than to the recipe wrapping it.
    it('let an asset mosaic name the asset its segments are, and state that its base bands are not selectable', () => {
        const {segmentSource} = recipeType('ASSET_MOSAIC')
        expect(segmentSource.segmentsAsset({assetDetails: {assetId: 'users/x/segments'}})).toBe('users/x/segments')
        expect(segmentSource.dateFormat).toBeUndefined()
        expect(segmentSource.selectableBaseBands).toBe(false)
    })

    it('are absent for a type that produces no segments', () => {
        expect(recipeType('MASKING').segmentSource).toBeUndefined()
    })
})
