import {describe, expect, it, vi} from 'vitest'

vi.mock('~/translate', () => ({msg: key => (Array.isArray(key) ? key.join('.') : key)}))
// Loading the recipe types closes an import cycle through the user module's forms; nothing here reads it.
vi.mock('~/user', () => ({}))

const {addRecipeType} = await import('../../recipeTypeRegistry')
const {default: planetMosaic} = await import('../planetMosaic/planetMosaic')
const {getAllVisualizations} = await import('./ccdcRecipe')
const {toHarmonicVisualization} = await import('./harmonicVisualizations')

addRecipeType(planetMosaic())

// The templates a CCDC over a Planet collection offers: Planet Mosaic's presets over the choices temporal recipes offer,
// then the harmonics of each index among them. Planet Mosaic's kndvi preset is excluded by those temporal choices.
describe('the templates a Planet CCDC offers', () => {
    it('are the Planet presets for its spectral bands and five indexes, then those indexes\' harmonics', () => {
        const ccdc = {
            type: 'CCDC',
            model: {
                sources: {dataSets: {PLANET: ['DAILY']}},
                options: {cloudMasking: 'MODERATE', cloudBuffer: 0, histogramMatching: 'DISABLED'}
            }
        }
        const indexes = ['ndvi', 'ndwi', 'evi', 'evi2', 'savi']

        expect(getAllVisualizations(ccdc).map(({bands}) => bands)).toEqual([
            ['red', 'green', 'blue'],
            ['nir', 'red', 'green'],
            ...indexes.map(index => [index]),
            ...indexes.map(toHarmonicVisualization).filter(visualization => visualization).map(({bands}) => bands)
        ])
    })
})
