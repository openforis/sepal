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
