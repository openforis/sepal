import {describe, expect, it, vi} from 'vitest'

// What reaches a Masking recipe when its source is an existing CCDC Segments asset, and what is left of it by
// the time Masking exports. Characterization only - nothing here asks Masking to know anything about CCDC.
//
// The asymmetry that governs everything below: a CCDC asset physically carries `<measure>_coefs`, `_rmse` and
// `_magnitude`, while its visualization templates name the LOGICAL bands Slice derives - the measure itself and
// its `_phase_n` / `_amplitude_n` bands. Masking stores the physical band names and the logical templates side
// by side, and every consumer that matches one against the other finds nothing.

vi.mock('~/compose', () => ({
    compose: Component => Component,
    composeHoC: () => Component => Component
}))

vi.mock('~/translate', () => ({
    msg: key => (Array.isArray(key) ? key.join('.') : key)
}))

// The panel builds its field descriptors at module load, and the real `Form` barrel is not resolvable outside a
// mounted app. Only the fluent no-ops are needed; nothing here renders the panel.
vi.mock('~/widget/form', () => {
    class Field {
        notBlank() { return this }
        notEmpty() { return this }
        skip() { return this }
    }
    return {Form: {Field}}
})

const {modelToValues, valuesToModel} = await import('./panels/inputImage/inputImage')
const {getAvailableBands} = await import('./bands')
const {getPreSetVisualizations} = await import('./visualizations')

// The real asset's physical bands, trimmed to two measures.
const PHYSICAL_BANDS = [
    'tStart', 'tEnd', 'tBreak', 'numObs', 'changeProb',
    'ndvi_coefs', 'ndvi_rmse', 'ndvi_magnitude',
    'nbr_coefs', 'nbr_rmse', 'nbr_magnitude'
]

// Templates as the asset parser hands them over today: `baseBands` an unsplit string (a parser defect, pinned
// in assetVisualizationParser.test.js), bands logical.
const MEASURE_TEMPLATE = {
    id: 'v-measure',
    type: 'continuous',
    bands: ['ndvi'],
    baseBands: 'ndvi',
    min: [-10000],
    max: [10000],
    palette: ['#112040', '#172313']
}

const HARMONIC_TEMPLATE = {
    id: 'v-harmonic',
    type: 'hsv',
    bands: ['ndvi_phase_1', 'ndvi_amplitude_1', 'ndvi_rmse'],
    baseBands: 'ndvi',
    min: [-3.141592653589793, 0, 0],
    max: [3.141592653589793, 3000, 2500],
    inverted: [false, false, true]
}

const RMSE_TEMPLATE = {
    id: 'v-rmse',
    type: 'continuous',
    bands: ['ndvi_rmse'],
    baseBands: 'ndvi',
    min: [0],
    max: [2500],
    palette: ['#000000', '#FFFFFF']
}

const maskingRecipe = (visualizations = [MEASURE_TEMPLATE, HARMONIC_TEMPLATE, RMSE_TEMPLATE]) => ({
    id: 'masking-1',
    type: 'MASKING',
    model: {
        imageToMask: {
            type: 'ASSET',
            id: 'users/wiell/amazonas_ccdc',
            bands: PHYSICAL_BANDS,
            visualizations
        }
    }
})

describe('what a CCDC asset leaves in the Masking model', () => {
    it('stores the physical band names, not the logical CCDC ones', () => {
        expect(Object.keys(getAvailableBands(maskingRecipe()))).toEqual(PHYSICAL_BANDS)
    })

    it('stores every copied template whatever bands it names', () => {
        expect(getPreSetVisualizations(maskingRecipe()).map(({id}) => id))
            .toEqual(['v-measure', 'v-harmonic', 'v-rmse'])
    })

    // Nothing in the Masking model records that the source had segments, which measures it had, or that a
    // template is a CCDC template. `baseBands` rides along inside each visualization and is the only trace.
    it('keeps no record of the CCDC structure the templates belong to', () => {
        const {imageToMask} = maskingRecipe().model

        expect(Object.keys(imageToMask).sort()).toEqual(['bands', 'id', 'type', 'visualizations'])
        expect(imageToMask.visualizations[0].baseBands).toBe('ndvi')
    })
})

// The band-name rule every Masking consumer applies - the export's visualization filter, the layer form's preset
// list and the generic reconciler alike.
describe('which copied templates a band-name rule can admit', () => {
    const admits = ({bands}) => bands.every(band => PHYSICAL_BANDS.includes(band))

    it('rejects a template on the measure itself, which is only a logical band', () => {
        expect(admits(MEASURE_TEMPLATE)).toBe(false)
    })

    it('rejects a harmonic template, whose phase and amplitude bands are derived', () => {
        expect(admits(HARMONIC_TEMPLATE)).toBe(false)
    })

    it('admits a template on a residual band, which is physically present', () => {
        expect(admits(RMSE_TEMPLATE)).toBe(true)
    })

    // The real asset carries sixteen templates and not one of them survives: eleven name a measure, five are
    // harmonic. A Masking recipe over it therefore exports no visualizations at all.
    it('admits none of the templates a real CCDC asset carries', () => {
        const realTemplates = [
            {bands: ['red', 'green', 'blue']},
            {bands: ['nir', 'red', 'green']},
            {bands: ['ndvi']},
            {bands: ['nbr']},
            {bands: ['ndvi_phase_1', 'ndvi_amplitude_1', 'ndvi_rmse']},
            {bands: ['nbr_phase_1', 'nbr_amplitude_1', 'nbr_rmse']}
        ]

        expect(realTemplates.filter(admits)).toEqual([])
    })
})

// The panel round trip. Reopening a saved Masking recipe and applying the panel again is what makes this matter.
describe('the input-image panel round trip', () => {
    const model = {
        type: 'ASSET',
        id: 'users/wiell/amazonas_ccdc',
        bands: PHYSICAL_BANDS,
        visualizations: [MEASURE_TEMPLATE]
    }

    it('restores the asset and its bands', () => {
        const values = modelToValues(model)

        expect(values.section).toBe('ASSET')
        expect(values.asset).toBe('users/wiell/amazonas_ccdc')
        expect(values.bands).toBe(PHYSICAL_BANDS)
    })

    // DEFECT. A misspelled key - `visualiations` - so the templates are never restored into the form.
    // Re-applying the panel without reloading the asset writes `visualizations: undefined` back over them and
    // the copied templates are gone for good.
    it('does not restore the templates, and loses them on the next apply', () => {
        const values = modelToValues(model)

        expect(values.visualizations).toBeUndefined()
        expect(values.visualiations).toBe(model.visualizations)
        expect(valuesToModel(values).visualizations).toBeUndefined()
    })

    it('carries the templates through when the form does hold them', () => {
        const values = {...modelToValues(model), visualizations: model.visualizations}

        expect(valuesToModel(values).visualizations).toBe(model.visualizations)
    })
})
