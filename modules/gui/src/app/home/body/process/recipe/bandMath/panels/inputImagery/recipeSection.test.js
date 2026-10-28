import {describe, expect, it, vi} from 'vitest'

// What Band Math takes from a recipe chosen as an input image. Selecting a source brings over what that
// source says about its output - the presets its type derives AND the styles someone made for it - so a
// style made on a Radar Mosaic is available to visualize the Band Math output built from it.
//
// Derived from a Band Math recipe over one radar image, whose output carries `VV`, `VH` and a calculated
// `ratio`.

vi.mock('~/compose', () => ({
    compose: (Component, ..._wrappers) => Component,
    composeHoC: () => Component => Component
}))

vi.mock('~/widget/recipeInput', () => ({RecipeInput: () => null}))

vi.mock('~/app/home/body/process/recipeTypeRegistry', () => ({
    getRecipeType: () => ({
        getAvailableBands: () => ({VV: {}, VH: {}}),
        getPreSetVisualizations: recipe => recipe.model.presets || []
    })
}))

const {RecipeSection} = await import('./recipeSection')

const OWN_STYLE = {id: 'v-vv', bands: ['VV'], type: 'continuous', userDefined: true}
const PRESET = {id: 'p-vvvh', bands: ['VV', 'VH'], type: 'rgb'}

const radarMosaic = ({own = [], presets = []} = {}) => ({
    id: 'radar-1',
    type: 'RADAR_MOSAIC',
    model: {presets},
    layers: {userDefinedVisualizations: {'this-recipe': own}}
})

const selecting = recipe => {
    let loaded
    const section = new RecipeSection({onLoaded: value => loaded = value})
    section.onRecipeLoaded({recipe, bandNames: ['VV', 'VH']})
    return loaded
}

describe('selecting a recipe as an input image', () => {
    it('takes the styles that recipe owns for its output', () => {
        const loaded = selecting(radarMosaic({own: [OWN_STYLE]}))

        expect(loaded.visualizations.map(({id}) => id)).toEqual(['v-vv'])
    })

    // Band Math renames what it takes, and the consumer may not edit a style it does not own; both are
    // reasons the style arrives as a preset rather than as one of this recipe's own.
    it('takes them without the mark that makes a style editable', () => {
        const loaded = selecting(radarMosaic({own: [OWN_STYLE]}))

        expect(loaded.visualizations[0].userDefined).toBeUndefined()
        expect(loaded.visualizations[0].id).toBe('v-vv')
    })

    it('takes the presets beside them', () => {
        const loaded = selecting(radarMosaic({own: [OWN_STYLE], presets: [PRESET]}))

        expect(loaded.visualizations.map(({id}) => id)).toEqual(['v-vv', 'p-vvvh'])
    })

    it('takes nothing from a source nobody has styled', () => {
        expect(selecting(radarMosaic()).visualizations).toEqual([])
    })

    it('records the source as a recipe reference', () => {
        expect(selecting(radarMosaic()).recipe).toEqual({type: 'RECIPE_REF', id: 'radar-1'})
    })
})
