import {describe, expect, it, vi} from 'vitest'

// What the Slice layer form offers. Two styles over one band are two choices, a style naming a band this
// operation does not produce is not offered, and the break-date preset the recipe derives itself is held to
// the same rule. Selecting among them, and whether the selection may be drawn, belong to the generic layer.

vi.mock('~/compose', () => ({
    compose: Component => Component,
    composeHoC: () => Component => Component
}))

vi.mock('~/translate', () => ({msg: key => (Array.isArray(key) ? key.join('.') : key)}))
vi.mock('~/classComponent', () => ({asFunctionalComponent: () => Component => Component}))
vi.mock('~/app/home/map/mapAreaContext', () => ({withMapArea: () => Component => Component}))
vi.mock('~/app/home/map/mapAreaLayout', () => ({MapAreaLayout: () => null}))
vi.mock('~/app/home/map/imageLayerSource/visualizationSelector', () => ({VisualizationSelector: () => null}))
vi.mock('~/apiRegistry', () => ({default: {}}))
vi.mock('~/app/home/body/process/recipe', () => ({recipeActionBuilder: () => () => ({})}))

const {CCDCSliceImageLayer} = await import('./ccdcSliceImageLayer')

const NDVI = {id: 't-ndvi', bands: ['ndvi'], type: 'continuous', palette: ['#000', '#fff']}
const ANOTHER_NDVI = {id: 't-ndvi-2', bands: ['ndvi'], type: 'continuous', palette: ['#111', '#222']}
const UNPRODUCED = {id: 't-nbr', bands: ['nbr'], type: 'continuous'}

const BREAK_DATE = 'tBreak'

const sliceShowing = (templates, segmentBands = ['tStart', 'tBreak']) => ({
    id: 'slice-1',
    type: 'CCDC_SLICE',
    ui: {
        initialized: true,
        sourceEvidence: {
            sourceKey: 'RECIPE_REF:ccdc-1',
            status: 'OBSERVED',
            segments: {
                bands: ['ndvi_coefs', ...segmentBands],
                baseBands: [{name: 'ndvi', measures: ['value']}],
                segmentBands: segmentBands.map(name => ({name})),
                visualizations: templates
            }
        }
    },
    model: {
        source: {type: 'RECIPE_REF', id: 'ccdc-1'},
        date: {dateType: 'SINGLE', date: '2020-06-01'},
        options: {gapStrategy: 'MASK', harmonics: 3}
    }
})

const offeredBy = recipe => new CCDCSliceImageLayer({
    recipe,
    source: {id: 'this-recipe'},
    layerConfig: {}
}).renderImageLayerForm().props.presetOptions[0].options

const offered = templates => offeredBy(sliceShowing(templates))

describe('the templates a slice offers', () => {
    it('are the source\'s, materialized against what it produces', () => {
        expect(offered([NDVI, UNPRODUCED]).map(({value}) => value)).toEqual(['t-ndvi', BREAK_DATE])
    })

    it('give two styles over one band two choices', () => {
        expect(offered([NDVI, ANOTHER_NDVI]).map(({value}) => value))
            .toEqual(['t-ndvi', 't-ndvi-2', BREAK_DATE])
    })

    it('label them by the bands they describe', () => {
        expect(offered([NDVI, ANOTHER_NDVI]).map(({label}) => label))
            .toEqual(['ndvi', 'ndvi', BREAK_DATE])
    })
})

// The recipe derives this one itself rather than taking it from the source, and it is offered on the same
// terms as any other: only where the operation produces the band it colours.
describe('the break-date preset', () => {
    it('is not offered by a slice that produces no break dates', () => {
        expect(offeredBy(sliceShowing([NDVI], ['tStart'])).map(({value}) => value)).toEqual(['t-ndvi'])
    })
})
