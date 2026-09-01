import {beforeEach, describe, expect, it, vi} from 'vitest'

// Masking's layer form, on the band-name question only. The rule itself is pure and tested in
// visualizationMatching.test.js; what is checked here is that Masking asks it about the presets it copied from its
// source, and that the answer reaches the selector.
//
// The stale-selection case runs the real VisualizationSelector on the props Masking produced, because "no longer
// appears selected" is the selector's own reading of those props, and asserting it from a duplicate of that
// reading would prove nothing. The saved selection stays in the layer config - nothing clears it, so a source
// change can make it valid again - which is exactly why the form must resolve it against the current options
// rather than display it blindly.
//
// `compose` is mocked to the identity so both exported components are their classes. Nothing renders: `render()`
// returns plain elements, and the assertions read their props.

vi.mock('~/compose', () => ({
    compose: Component => Component,
    composeHoC: () => Component => Component
}))

vi.mock('~/translate', () => ({
    msg: key => (Array.isArray(key) ? key.join('.') : key)
}))

const {MaskingImageLayer} = await import('./maskingImageLayer')
const {VisualizationSelector} = await import('~/app/home/map/imageLayerSource/visualizationSelector')

// A CCDC Segments asset. `ndvi` is not among its bands - the segments carry per-band coefficients, not the index
// itself - yet a Masking recipe over it still copies the CCDC presets, `ndvi` included.
const SEGMENT_BANDS = ['tStart', 'tEnd', 'tBreak', 'ndvi_coefs', 'ndvi_rmse', 'ndvi_magnitude']

const NDVI = {bands: ['ndvi'], type: 'continuous', palette: ['#ff0000', '#00ff00']}

const recipeOf = ({bands, visualizations}) => ({
    id: 'masking-1',
    type: 'MASKING',
    model: {imageToMask: {bands, visualizations}}
})

const selectorOf = ({bands, visualizations, visParams}) => {
    const layerConfig = visParams ? {visParams} : {}
    const instance = new MaskingImageLayer({
        recipe: recipeOf({bands, visualizations}),
        source: {id: 'source-1'},
        layerConfig
    })
    return {selector: instance.renderImageLayerForm(), layerConfig}
}

const presetBands = selector =>
    selector.props.presetOptions
        .flatMap(({options}) => options)
        .map(({visParams: {bands}}) => bands.join(', '))

const selectedOptionOf = selector =>
    new VisualizationSelector({...selector.props, userDefinedVisualizations: []})
        .render().props.value

describe('MaskingImageLayer preset options', () => {
    let selector

    beforeEach(() => {
        selector = selectorOf({
            bands: SEGMENT_BANDS,
            visualizations: [NDVI, {bands: ['ndvi_rmse']}]
        }).selector
    })

    it('drops a copied preset naming a band the source does not have', () => {
        expect(presetBands(selector)).not.toContain('ndvi')
    })

    it('keeps a copied preset whose band exists', () => {
        expect(presetBands(selector)).toContain('ndvi_rmse')
    })

    it('keeps a multi-band preset only when every one of its bands exists', () => {
        const {selector} = selectorOf({
            bands: SEGMENT_BANDS,
            visualizations: [
                {bands: ['ndvi_rmse', 'ndvi_magnitude']},
                {bands: ['ndvi_rmse', 'ndvi']}
            ]
        })
        expect(presetBands(selector)).toEqual(['ndvi_rmse, ndvi_magnitude'])
    })

    it('offers no presets when the source has no bands', () => {
        const {selector} = selectorOf({bands: [], visualizations: [NDVI]})
        expect(presetBands(selector)).toEqual([])
    })

    it('passes the source band names to the selector, so user-defined styles follow the same rule', () => {
        expect(selector.props.availableBands).toEqual(SEGMENT_BANDS)
    })
})

describe('MaskingImageLayer stale selection', () => {
    it('does not present a filtered-out preset as the selector current option', () => {
        const {selector} = selectorOf({
            bands: SEGMENT_BANDS,
            visualizations: [NDVI, {bands: ['ndvi_rmse']}],
            visParams: NDVI
        })
        expect(selectedOptionOf(selector)).toBeUndefined()
    })

    // Masking filters candidates and nothing else. The selection is the user's saved intent, and nothing
    // overwrites it to fix a display problem - the layer and its palette are withheld instead.
    it('passes the selection through without rewriting it', () => {
        const {selector, layerConfig} = selectorOf({
            bands: SEGMENT_BANDS,
            visualizations: [NDVI, {bands: ['ndvi_rmse']}],
            visParams: NDVI
        })
        expect(layerConfig.visParams).toEqual(NDVI)
        expect(selector.props.selectedVisParams).toBe(layerConfig.visParams)
    })
})

describe('MaskingImageLayer with a fully valid source', () => {
    const bands = ['red', 'nir', 'swir1']
    const visualizations = [{bands: ['red', 'nir', 'swir1']}, {bands: ['nir']}]

    it('offers every copied preset', () => {
        const {selector} = selectorOf({bands, visualizations})
        expect(presetBands(selector)).toEqual(['red, nir, swir1', 'nir'])
    })

    it('still presents the selected preset as the current option', () => {
        const {selector} = selectorOf({bands, visualizations, visParams: {bands: ['nir']}})
        expect(selectedOptionOf(selector)).toBe('nir')
    })
})
