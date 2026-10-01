import _ from 'lodash'
import {describe, expect, it, vi} from 'vitest'

// Which preset the visualization picker shows for an Asset recipe layer, over the recipe's own options. The picker
// resolves a selection by preset id, as for a direct asset layer, and by bands for a preset saved without one.

vi.mock('~/compose', () => ({
    compose: Component => Component,
    composeHoC: () => Component => Component
}))

vi.mock('~/translate', () => ({msg: key => key}))

const {VisualizationSelector} = await import('~/app/home/map/imageLayerSource/visualizationSelector')
const {reconciledSelection} = await import('../visualizationMatching')
const {getPreSetVisualizations, visualizationOptions} = await import('./visualizations')

const GREYS = {id: 'greys', type: 'continuous', bands: ['elevation'], min: [0], max: [1000], palette: ['#000000', '#ffffff']}
const TERRAIN = {id: 'terrain', type: 'continuous', bands: ['elevation'], min: [0], max: [4000], palette: ['#00a000', '#ffffff']}

describe('the preset an Asset recipe layer shows', () => {
    it('is the one chosen automatically', () => {
        const recipe = assetRecipe([GREYS, TERRAIN])

        const selected = reconciledSelection({visualizations: getPreSetVisualizations(recipe), visParams: undefined})

        expect(shown(recipe, selected)).toEqual(GREYS)
    })

    it('is the one chosen, though another preset draws the same bands', () => {
        const recipe = assetRecipe([GREYS, TERRAIN])

        expect(shown(recipe, TERRAIN)).toEqual(TERRAIN)
    })

    it('is found by its bands when it was saved without an id', () => {
        const preset = _.omit(GREYS, 'id')
        const recipe = assetRecipe([preset])

        expect(shown(recipe, preset)).toEqual(preset)
    })
})

const assetRecipe = visualizations => ({
    id: 'asset-recipe',
    type: 'ASSET',
    model: {assetDetails: {assetId: 'users/x/dem', visualizations}}
})

// The preset whose option the picker displays for this selection, or undefined when it displays none.
const shown = (recipe, selectedVisParams) => {
    const combo = new VisualizationSelector({
        source: {id: 'this-recipe'},
        recipe,
        userDefinedVisualizations: [],
        presetOptions: visualizationOptions(recipe),
        availableBands: {elevation: {dataType: {arrayDimensions: 0}}},
        selectedVisParams
    }).render()
    const {value, options} = combo.props
    return value === undefined
        ? undefined
        : options.flatMap(group => group.options).find(option => option.value === value)?.visParams
}
