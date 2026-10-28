import {describe, expect, it, vi} from 'vitest'

// Band Math and Stack offer their inputs' styles as presets, re-expressed in their output's band names. A preset is
// chosen by what the layer saved of it, so what the layer shows as chosen is the option the selector resolves that
// selection to: one carrying an identity by that identity, one without by its bands. The real option builders and the
// real selector; `compose` is the identity, so the selector is the class itself and its render is read, not mounted.

vi.mock('~/compose', () => ({
    compose: Component => Component,
    composeHoC: () => Component => Component
}))

vi.mock('~/translate', () => ({
    msg: key => (Array.isArray(key) ? key.join('.') : key)
}))

const {VisualizationSelector} = await import('~/app/home/map/imageLayerSource/visualizationSelector')
const bandMath = await import('./bandMath/visualizations')
const stack = await import('./stack/visualizations')

const RADAR = {id: 'v-radar', bands: ['VV', 'VH', 'VV'], type: 'rgb'}
const RATIO = {id: 'v-ratio', bands: ['VV', 'VH', 'VV'], type: 'rgb', gamma: 2}
const UNIDENTIFIED = {bands: ['VH'], type: 'continuous'}
const USER_DEFINED = {id: 'u-1', bands: ['VV'], type: 'continuous', userDefined: true}

const SCALAR = {dataType: {arrayDimensions: 0}}

// Each type's own model over one asset with VV and VH, its bands output under their own names.
const RECIPES = {
    'Band Math': {
        builder: bandMath,
        recipeOf: visualizations => ({
            model: {
                inputImagery: {images: [{imageId: 'i-1', type: 'ASSET', id: 'users/x/radar', visualizations}]},
                outputBands: {outputImages: [{imageId: 'i-1', outputBands: [
                    {name: 'VV', defaultOutputName: 'VV'},
                    {name: 'VH', defaultOutputName: 'VH'}
                ]}]}
            }
        })
    },
    Stack: {
        builder: stack,
        recipeOf: visualizations => ({
            model: {
                inputImagery: {images: [{imageId: 'i-1', type: 'ASSET', id: 'users/x/radar', visualizations}]},
                bandNames: {bandNames: [{imageId: 'i-1', bands: [
                    {originalName: 'VV', outputName: 'VV'},
                    {originalName: 'VH', outputName: 'VH'}
                ]}]}
            }
        })
    }
}

describe.each(Object.keys(RECIPES))('a %s layer', type => {
    const {builder, recipeOf} = RECIPES[type]

    const selectorOver = (recipe, {selectedVisParams, userDefinedVisualizations = []} = {}) =>
        new VisualizationSelector({
            source: {id: 'this-recipe'},
            recipe: {id: 'recipe-1'},
            userDefinedVisualizations,
            presetOptions: builder.visualizationOptions(recipe, {}),
            availableBands: {VV: SCALAR, VH: SCALAR},
            selectedVisParams
        })

    // The option the combo shows as its value, if it shows one.
    const chosen = combo => combo.props.value === undefined
        ? undefined
        : combo.props.options.flatMap(({options}) => options).find(({value}) => value === combo.props.value)

    const presetOf = (recipe, id) => builder.getPreSetVisualizations(recipe).find(preset => preset.id === id)

    it('shows an identified preset it saved as chosen, labelled by its bands', () => {
        const recipe = recipeOf([RADAR])

        const combo = selectorOver(recipe, {selectedVisParams: presetOf(recipe, RADAR.id)}).render()

        expect(chosen(combo).visParams.id).toBe(RADAR.id)
        expect(chosen(combo).label).toBe('VV, VH, VV')
    })

    it('keeps it chosen when its options are built again from the same recipe', () => {
        const recipe = recipeOf([RADAR])
        const selector = selectorOver(recipe, {selectedVisParams: presetOf(recipe, RADAR.id)})
        const before = selector.render().props.value

        selector.props = {...selector.props, presetOptions: builder.visualizationOptions(structuredClone(recipe), {})}

        expect(before).toBeDefined()
        expect(selector.render().props.value).toBe(before)
    })

    it('shows a preset without an identity as chosen by its bands', () => {
        const recipe = recipeOf([UNIDENTIFIED])

        const combo = selectorOver(recipe, {selectedVisParams: {bands: ['VH'], type: 'continuous'}}).render()

        expect(chosen(combo).visParams.bands).toEqual(['VH'])
    })

    it('tells apart two presets over the same bands by their identities', () => {
        const recipe = recipeOf([RADAR, RATIO])

        const combo = selectorOver(recipe, {selectedVisParams: presetOf(recipe, RATIO.id)}).render()

        expect(chosen(combo).visParams).toMatchObject({id: RATIO.id, gamma: 2})
    })

    it('shows a style the user defined as chosen, beside the presets', () => {
        const combo = selectorOver(recipeOf([RADAR]), {
            selectedVisParams: USER_DEFINED,
            userDefinedVisualizations: [USER_DEFINED]
        }).render()

        expect(chosen(combo).visParams).toBe(USER_DEFINED)
    })

    it('shows nothing chosen for an identified selection no option carries, though a preset has its bands', () => {
        const combo = selectorOver(recipeOf([RADAR]), {
            selectedVisParams: {id: 'v-gone', bands: RADAR.bands, type: 'rgb'}
        }).render()

        expect(combo.props.value).toBeUndefined()
    })
})
