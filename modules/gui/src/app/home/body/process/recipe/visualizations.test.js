import {describe, expect, it, vi} from 'vitest'

// What one recipe offers another about its output. The rule is the same wherever a consumer takes
// visualizations from a source - an input panel, a map layer, a wrapper observing what it inherits - so it
// is stated once here.

vi.mock('../recipeTypeRegistry', () => ({
    getRecipeType: type => (type === 'BAND_MATH'
        ? {getPreSetVisualizations: recipe => recipe.model.presets || []}
        : undefined)
}))

const {getUserDefinedVisualizations, outputOwnedVisualizations, recipeVisualizations, recipeVisualizationsNaming, sourceVisualizations} =
    await import('./visualizations')

const RATIO = {id: 'v-ratio', bands: ['ratio'], type: 'continuous', userDefined: true}
const VV = {id: 'v-vv', bands: ['VV'], type: 'continuous', userDefined: true}
const MASK_STYLE = {id: 'v-mask', bands: ['VH'], type: 'continuous', userDefined: true}
const PRESET = {id: 'p-vvvh', bands: ['VV', 'VH'], type: 'rgb'}

const bandMath = ({own = [], onOtherLayers = {}, presets = []} = {}) => ({
    id: 'band-math-1',
    type: 'BAND_MATH',
    model: {presets},
    layers: {userDefinedVisualizations: {'this-recipe': own, ...onOtherLayers}}
})

describe('the styles a recipe owns for its own output', () => {
    it('are offered to a consumer', () => {
        expect(outputOwnedVisualizations(bandMath({own: [RATIO]})).map(({id}) => id)).toEqual(['v-ratio'])
    })

    // The consumer may neither edit nor delete a style it does not own, and `userDefined` is what the
    // selector reads to decide between the two.
    it('are offered without the mark that makes a style editable', () => {
        expect(outputOwnedVisualizations(bandMath({own: [RATIO]})))
            .toEqual([{id: 'v-ratio', bands: ['ratio'], type: 'continuous'}])
    })

    it('keep the identity the source knows them by', () => {
        expect(outputOwnedVisualizations(bandMath({own: [RATIO, VV]})).map(({id}) => id))
            .toEqual(['v-ratio', 'v-vv'])
    })

    // A style filed under another layer describes that layer's image - a mask, a second input - and says
    // nothing about what this recipe produces.
    it('exclude styles made for another input layer', () => {
        const recipe = bandMath({own: [RATIO], onOtherLayers: {'some-mask-source': [MASK_STYLE]}})

        expect(outputOwnedVisualizations(recipe).map(({id}) => id)).toEqual(['v-ratio'])
    })

    it('are empty for a recipe nobody has styled', () => {
        expect(outputOwnedVisualizations(bandMath())).toEqual([])
    })
})

describe('what a source offers as a whole', () => {
    it('is its own styles and the presets its type derives', () => {
        expect(sourceVisualizations(bandMath({own: [RATIO], presets: [PRESET]})).map(({id}) => id))
            .toEqual(['v-ratio', 'p-vvvh'])
    })

    // Whether a style can be drawn depends on the consumer's output, and an asset's transformation
    // templates are not styles for the image carrying them. Deciding that here would delete them from
    // every consumer instead of withholding them from one offer.
    it('is not filtered by what can be drawn', () => {
        const overMissingBand = {id: 'p-gone', bands: ['ratio_VV_VH'], type: 'continuous'}

        expect(sourceVisualizations(bandMath({presets: [overMissingBand]})).map(({id}) => id))
            .toEqual(['p-gone'])
    })

    it('is empty for a type with no definition at all', () => {
        expect(sourceVisualizations({id: 'x', type: 'UNKNOWN', model: {}, layers: {}})).toEqual([])
    })
})

// The recipe's own candidate list is a different question: there its styles ARE its own, and what it offers
// is filtered by the bands the caller says it has.
describe('a recipe showing its own output', () => {
    const BANDS = Object.fromEntries(['ratio', 'VV', 'VH'].map(name => [name, {dataType: {arrayDimensions: 0}}]))

    it('keeps its styles editable', () => {
        expect(recipeVisualizations(bandMath({own: [RATIO]}), BANDS)[0].userDefined).toBe(true)
    })

    it('withholds a style naming a band it does not have', () => {
        const recipe = bandMath({presets: [{id: 'p-gone', bands: ['ratio_VV_VH'], type: 'continuous'}]})

        expect(recipeVisualizations(recipe, BANDS)).toEqual([])
    })

    it('offers nothing while no bands are known', () => {
        expect(recipeVisualizations(bandMath({own: [RATIO], presets: [PRESET]}), undefined)).toEqual([])
    })
})

// A workflow copying styles from a source it observed, or deriving templates from a catalogue, matches them by name
// alone: what can be drawn is decided where they are drawn, so a style over array bands is carried on, and withheld
// only there.
describe('the styles a recipe offers for bands named by a workflow', () => {
    const ARRAY_STYLE = {id: 'p-coefs', bands: ['VV'], type: 'continuous'}

    it('keeps a style over bands the workflow names, whatever their shape', () => {
        const recipe = bandMath({presets: [ARRAY_STYLE]})

        expect(recipeVisualizationsNaming(recipe, ['VV'])).toEqual([ARRAY_STYLE])
        expect(recipeVisualizations(recipe, {VV: {dataType: {arrayDimensions: 1}}})).toEqual([])
    })

    it('withholds a style naming a band the workflow does not name', () => {
        expect(recipeVisualizationsNaming(bandMath({presets: [PRESET]}), ['VV'])).toEqual([])
    })
})

describe('reading the styles of one layer', () => {
    it('returns only that layer\'s', () => {
        const recipe = bandMath({own: [RATIO], onOtherLayers: {'other-source': [MASK_STYLE]}})

        expect(getUserDefinedVisualizations(recipe, 'other-source').map(({id}) => id)).toEqual(['v-mask'])
    })
})
