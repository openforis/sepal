import {describe, expect, it, vi} from 'vitest'

vi.mock('~/translate', () => ({msg: key => (Array.isArray(key) ? key.join('.') : key)}))
// Loading the recipe types closes an import cycle through the user module's forms; nothing here reads it.
vi.mock('~/user', () => ({}))

const {getAllVisualizations} = await import('./ccdcRecipe')
const {toHarmonicVisualization} = await import('./harmonicVisualizations')

// The templates a CCDC over Sentinel-1 offers for its measures: a point-in-time radar composite's presets at the
// collection's scale, then each measure's harmonics. Collection templates, whatever Radar Mosaic declares.
describe('the templates a radar CCDC offers', () => {
    it('are the point-in-time radar presets scaled a hundredfold, then the harmonics of each polarisation and their ratio', () => {
        const ccdc = {type: 'CCDC', model: {sources: {dataSets: {SENTINEL_1: ['SENTINEL_1']}}, options: {}}}

        expect(getAllVisualizations(ccdc).map(essentials)).toEqual([
            {type: 'rgb', bands: ['VV', 'VH', 'ratio_VV_VH'], min: [-2000, -2500, 300], max: [0, -500, 1400], baseBands: ['VV', 'VH', 'ratio_VV_VH']},
            {type: 'continuous', bands: ['dayOfYear'], min: [0], max: [36600], palette: ['#00FFFF', '#000099'], baseBands: ['dayOfYear']},
            {type: 'continuous', bands: ['daysFromTarget'], min: [0], max: [18300], palette: ['#00FF00', '#FF0000'], baseBands: ['daysFromTarget']},
            ...['VV', 'VH', 'ratio_VV_VH'].map(band => essentials(toHarmonicVisualization(band)))
        ])
    })
})

const essentials = ({type, bands, min, max, palette, baseBands}) =>
    ({type, bands, min, max, ...(palette && {palette}), ...(baseBands && {baseBands})})
