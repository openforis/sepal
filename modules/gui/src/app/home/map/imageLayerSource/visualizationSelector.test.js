import {describe, expect, it, vi} from 'vitest'

// The presentation toggle offers Palette, Legend or Values for the visualization currently being shown. When
// nothing is being shown - no selection, or one the current options no longer contain - there is nothing for it
// to toggle, and leaving it on screen advertises a control over a layer that does not exist.
//
// The question is answered by `selectedOption`, the resolved option the combo already uses for its value and for
// the edit and remove controls, not by the raw `selectedVisParams`: a stale selection is a non-null visParams
// that resolves to nothing, and that is exactly the case this must catch.
//
// `compose` is mocked to the identity so the exported component is the class itself. Nothing renders: `render()`
// returns a plain element and the assertions read its props.

vi.mock('~/compose', () => ({
    compose: Component => Component,
    composeHoC: () => Component => Component
}))

vi.mock('~/translate', () => ({
    msg: key => (Array.isArray(key) ? key.join('.') : key)
}))

// A layer form that names no bands leaves the recipe being shown to say what it has.
vi.mock('~/app/home/body/process/recipeTypeRegistry', () => ({
    getRecipeType: () => ({getAvailableBands: recipe => recipe.availableBands})
}))

const {VisualizationSelector} = await import('./visualizationSelector')
const {PresentationToggle} = await import('./presentationToggle')

const PRESET = {bands: ['ndvi'], type: 'continuous'}
const USER_DEFINED = {id: 'u1', bands: ['evi'], type: 'continuous', userDefined: true}

const presetOptions = [{
    label: 'Presets',
    options: [{value: 'ndvi', label: 'ndvi', visParams: PRESET}]
}]

const comboOf = ({selectedVisParams, userDefinedVisualizations = [USER_DEFINED]} = {}) =>
    new VisualizationSelector({
        source: {id: 'this-recipe'},
        recipe: {id: 'recipe-1'},
        userDefinedVisualizations,
        presetOptions,
        selectedVisParams
    }).render()

const hasPresentationToggle = combo =>
    (combo.props.buttons || []).some(({type}) => type === PresentationToggle)

const labelButton = (combo, key) => combo.props.labelButtons.find(button => button.key === key)

describe('the presentation toggle', () => {
    it('is absent while nothing is selected', () => {
        expect(hasPresentationToggle(comboOf())).toBe(false)
    })

    it('is absent for a selection the current options no longer contain', () => {
        expect(hasPresentationToggle(comboOf({selectedVisParams: {bands: ['gone']}}))).toBe(false)
    })

    it('is absent for a user-defined selection that has been filtered out', () => {
        expect(hasPresentationToggle(comboOf({
            selectedVisParams: USER_DEFINED,
            userDefinedVisualizations: []
        }))).toBe(false)
    })

    it('is present for a selected preset', () => {
        expect(hasPresentationToggle(comboOf({selectedVisParams: PRESET}))).toBe(true)
    })

    it('is present for a selected user-defined visualization', () => {
        expect(hasPresentationToggle(comboOf({selectedVisParams: USER_DEFINED}))).toBe(true)
    })
})

describe('the add, edit and remove controls', () => {
    it('offers all three whatever is selected', () => {
        ['add', 'edit', 'remove'].forEach(key => {
            expect(labelButton(comboOf(), key)).toBeDefined()
            expect(labelButton(comboOf({selectedVisParams: PRESET}), key)).toBeDefined()
        })
    })

    it('disables editing and removing while nothing is selected', () => {
        const combo = comboOf()
        expect(labelButton(combo, 'edit').props.disabled).toBe(true)
        expect(labelButton(combo, 'remove').props.disabled).toBe(true)
    })

    // A preset cannot be edited in place, only cloned into a user style - so removing it is meaningless.
    it('offers a preset selection as a clone, without a remove', () => {
        const combo = comboOf({selectedVisParams: PRESET})
        expect(labelButton(combo, 'edit').props.disabled).toBe(false)
        expect(labelButton(combo, 'remove').props.disabled).toBe(true)
    })

    it('offers a user-defined selection as an edit, with a remove', () => {
        const combo = comboOf({selectedVisParams: USER_DEFINED})
        expect(labelButton(combo, 'edit').props.disabled).toBe(false)
        expect(labelButton(combo, 'remove').props.disabled).toBe(false)
    })
})

// A layer showing ANOTHER recipe offers that recipe's styles alongside its own presets. They are read from
// the source, never copied here, so the consumer can choose one or clone it but neither edit nor delete it.
//
// Everything below goes through the rendered combo - its options, its value and its controls - because that
// is what a user acts on, and because whether a style can be edited is decided while resolving a selection.

const SOURCE_STYLE = {id: 'v-ratio', bands: ['ratio'], type: 'continuous', userDefined: true}
const LOCAL_STYLE = {id: 'v-local', bands: ['VV'], type: 'continuous', userDefined: true}
const SOURCE_PRESET = {id: 'p-vvvh', bands: ['VV', 'VH'], type: 'rgb'}

const bandMath = (own = [SOURCE_STYLE]) => ({
    id: 'band-math-1',
    type: 'BAND_MATH',
    layers: {userDefinedVisualizations: {'this-recipe': own}}
})

const bandMathWithBands = names => ({
    ...bandMath(),
    availableBands: Object.fromEntries(names.map(name => [name, {}]))
})

const inheritingProps = ({
    sourceRecipe = bandMath(),
    userDefinedVisualizations = [],
    availableBands,
    selectedVisParams
} = {}) => ({
    source: {id: 'band-math-1', sourceConfig: {recipeId: 'band-math-1'}},
    recipeId: 'masking-1',
    sourceRecipe,
    userDefinedVisualizations,
    presetOptions: [{label: 'presets', options: [{value: 'p-vvvh', label: 'VV, VH', visParams: SOURCE_PRESET}]}],
    availableBands,
    selectedVisParams
})

const inheriting = props => new VisualizationSelector(inheritingProps(props))

const renderedGroups = combo => combo.props.options
    .map(({label, options}) => [label, options.map(({value}) => value)])

const INHERITED = 'map.visualizationSelector.inherited.label'
const OWN = 'map.visualizationSelector.userDefined.label'

const groupNamed = (combo, label) => combo.props.options.find(group => group.label === label)

describe('a layer showing another recipe', () => {
    it('offers the styles that recipe owns for its output', () => {
        expect(renderedGroups(inheriting().render())).toContainEqual([INHERITED, ['v-ratio']])
    })

    it('keeps the presets its type derives', () => {
        expect(renderedGroups(inheriting().render())).toContainEqual(['presets', ['p-vvvh']])
    })

    it('leaves the consumer\'s own styles in their own group', () => {
        const combo = inheriting({userDefinedVisualizations: [LOCAL_STYLE]}).render()

        expect(groupNamed(combo, OWN).options.map(({value}) => value)).toEqual(['v-local'])
    })

    // Choosing one is fine; editing or deleting it is not this recipe's to do.
    it('offers a chosen inherited style as a clone, with removal disabled', () => {
        const combo = inheriting({selectedVisParams: {...SOURCE_STYLE, userDefined: undefined}}).render()

        expect(combo.props.value).toBe('v-ratio')
        expect(labelButton(combo, 'edit').props.icon).toBe('clone')
        expect(labelButton(combo, 'remove').props.disabled).toBe(true)
    })

    it('offers a chosen local style as an edit, with removal available', () => {
        const combo = inheriting({
            userDefinedVisualizations: [LOCAL_STYLE],
            selectedVisParams: LOCAL_STYLE
        }).render()

        expect(labelButton(combo, 'edit').props.icon).toBe('edit')
        expect(labelButton(combo, 'remove').props.disabled).toBe(false)
    })
})

// Nothing is copied here, so what the source says now is what is offered. The style is deleted upstream
// after the layer has already been rendered with it.
describe('a style deleted on the source after the layer was rendered', () => {
    it('stops being offered', () => {
        const selector = inheriting()
        expect(renderedGroups(selector.render())).toContainEqual([INHERITED, ['v-ratio']])

        selector.props = inheritingProps({sourceRecipe: bandMath([])})

        expect(renderedGroups(selector.render()).some(([label]) => label === INHERITED)).toBe(false)
    })

    it('leaves a selection naming it resolving to nothing, rather than to something else', () => {
        const selector = inheriting({selectedVisParams: {...SOURCE_STYLE, userDefined: undefined}})
        selector.render()

        selector.props = inheritingProps({
            sourceRecipe: bandMath([]),
            selectedVisParams: {...SOURCE_STYLE, userDefined: undefined}
        })

        expect(selector.render().props.value).toBeUndefined()
    })
})

// The renderer rejects a style over a band that is gone, and one over an array band has no single value per
// pixel to colour. Offering either puts a choice in the list the map cannot honour.
describe('a style the renderer could not draw', () => {
    const ARRAY_BANDS = {ratio: {dataType: {arrayDimensions: 1}}, VV: {}, VH: {}}

    it('is withheld when its band is missing, whoever owns it', () => {
        const combo = inheriting({
            userDefinedVisualizations: [{id: 'v-gone', bands: ['absent'], userDefined: true}],
            availableBands: {VV: {}, VH: {}}
        }).render()

        expect(renderedGroups(combo).some(([label]) => label === INHERITED)).toBe(false)
        expect(groupNamed(combo, OWN).options).toEqual([])
    })

    it('is withheld when its band is array-valued', () => {
        const combo = inheriting({availableBands: ARRAY_BANDS}).render()

        expect(renderedGroups(combo).some(([label]) => label === INHERITED)).toBe(false)
    })

    it('is withheld without being taken off the source', () => {
        const sourceRecipe = bandMath()
        inheriting({sourceRecipe, availableBands: ARRAY_BANDS}).render()

        expect(sourceRecipe.layers.userDefinedVisualizations['this-recipe']).toEqual([SOURCE_STYLE])
    })

    // Band Math's layer form supplies no band list of its own, so the recipe being shown answers for it.
    it('is withheld even when the layer names no bands itself', () => {
        const combo = inheriting({sourceRecipe: bandMathWithBands(['VV'])}).render()

        expect(renderedGroups(combo).some(([label]) => label === INHERITED)).toBe(false)
    })
})

// Copies made by earlier versions carry the identity of the style they were copied from. Offered in both
// groups, one value appears twice and whichever resolves first decides whether it can be edited.
describe('a local copy sharing an upstream identity', () => {
    const copied = {...SOURCE_STYLE}

    it('is offered once, as the local style it is', () => {
        const combo = inheriting({userDefinedVisualizations: [copied]}).render()

        expect(groupNamed(combo, OWN).options.map(({value}) => value)).toEqual(['v-ratio'])
        expect(renderedGroups(combo).some(([label]) => label === INHERITED)).toBe(false)
    })

    it('resolves a selection naming it to the local style, which can be edited', () => {
        const combo = inheriting({
            userDefinedVisualizations: [copied],
            selectedVisParams: copied
        }).render()

        expect(combo.props.value).toBe('v-ratio')
        expect(labelButton(combo, 'edit').props.icon).toBe('edit')
        expect(labelButton(combo, 'remove').props.disabled).toBe(false)
    })

    it('leaves the source\'s other styles inherited', () => {
        const other = {id: 'v-other', bands: ['ratio'], type: 'continuous', userDefined: true}
        const combo = inheriting({
            sourceRecipe: bandMath([SOURCE_STYLE, other]),
            userDefinedVisualizations: [copied]
        }).render()

        expect(groupNamed(combo, INHERITED).options.map(({value}) => value)).toEqual(['v-other'])
    })
})

// On a recipe's own layer its styles are already the editable ones. Offering them again as inherited would
// show each twice, once editable and once not.
describe('a layer showing the recipe it belongs to', () => {
    it('offers no inherited styles', () => {
        const combo = new VisualizationSelector({
            source: {id: 'this-recipe', sourceConfig: {recipeId: 'masking-1'}},
            recipeId: 'masking-1',
            sourceRecipe: {id: 'masking-1', layers: {userDefinedVisualizations: {'this-recipe': [LOCAL_STYLE]}}},
            userDefinedVisualizations: [LOCAL_STYLE],
            presetOptions: []
        }).render()

        expect(renderedGroups(combo)).toEqual([[OWN, ['v-local']]])
    })
})

describe('a layer whose source recipe is not in the session', () => {
    it('offers what it has, without failing', () => {
        expect(renderedGroups(inheriting({sourceRecipe: null}).render())).toEqual([
            [OWN, []],
            ['presets', ['p-vvvh']]
        ])
    })
})
