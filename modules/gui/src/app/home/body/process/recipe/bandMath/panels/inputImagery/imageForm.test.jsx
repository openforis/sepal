import {describe, expect, it, vi} from 'vitest'

vi.mock('~/translate', () => ({msg: id => id}))
vi.mock('~/widget/form', () => ({Form: {Input: () => null}}))
vi.mock('./bandSpec', () => ({BandSpec: () => null}))

import {ImageForm} from './imageForm'

describe('Band Math ImageForm band collection', () => {
    it('wraps selected bands in an Image bands collection with add and clear actions', () => {
        const includedBands = {
            value: [{id: 'red-id', name: 'red', type: 'continuous', legendEntries: []}],
            set: vi.fn()
        }
        const imageForm = new ImageForm({
            inputs: {
                bands: {value: {red: {}, nir: {}}},
                includedBands
            }
        })

        const collection = imageForm.renderIncludedBands()
        const header = collection.props.children

        expect(collection.props.expanded).toBe(true)
        expect(collection.props.expansion).toBeDefined()
        expect(header.props.title).toBe('process.classification.panel.inputImagery.bandSetSpec.imageBands.label')
        expect(header.props.inlineComponents.props.icon).toBe('plus')
        expect(header.props.removeDisabled).toBe(false)
        expect(header.props.removeConfirmationLabel).toBe('button.removeAll')
        expect(header.props.onRemove).toEqual(expect.any(Function))
    })

    it('keeps the collection expanded and renders an empty state when no bands are selected', () => {
        const imageForm = new ImageForm({
            inputs: {
                bands: {value: {red: {}, nir: {}}},
                includedBands: {value: [], set: vi.fn()}
            }
        })

        const collection = imageForm.renderIncludedBands()
        const emptyState = collection.props.expansion.props.children

        expect(collection.props.expanded).toBe(true)
        expect(emptyState.props.message).toBe('process.panels.inputImagery.form.noBands')
    })

    it('clears every selected band from the collection', () => {
        const includedBands = {
            value: [
                {id: 'red-id', name: 'red', type: 'continuous', legendEntries: []},
                {id: 'nir-id', name: 'nir', type: 'continuous', legendEntries: []}
            ],
            set: vi.fn()
        }
        const imageForm = new ImageForm({
            inputs: {
                bands: {value: {red: {}, nir: {}}},
                includedBands
            }
        })
        const clearAction = imageForm.renderIncludedBands().props.children.props.onRemove

        clearAction()

        expect(includedBands.set).toHaveBeenCalledWith([])
    })

    it('adds the real band named all without invoking the bulk action', () => {
        const existingBand = {id: 'red-id', name: 'red', type: 'continuous', legendEntries: [], custom: true}
        const includedBands = {
            value: [existingBand],
            set: vi.fn()
        }
        const imageForm = new ImageForm({
            inputs: {
                bands: {value: {red: {}, all: {}, nir: {}}},
                includedBands
            }
        })
        const addButton = imageForm.renderIncludedBands().props.children.props.inlineComponents
        const combo = addButton.props.children(vi.fn())
        const realAllBand = combo.props.options.find(({label}) => label === 'all')

        combo.props.onChange(realAllBand)

        const updatedBands = includedBands.set.mock.calls[0][0]
        expect(updatedBands[0]).toBe(existingBand)
        expect(updatedBands.map(({name}) => name)).toEqual(['red', 'all'])
    })

    it('adds every remaining band from the picker bulk action', () => {
        const existingBand = {id: 'red-id', name: 'red', type: 'continuous', legendEntries: [], custom: true}
        const includedBands = {
            value: [existingBand],
            set: vi.fn()
        }
        const imageForm = new ImageForm({
            inputs: {
                bands: {value: {red: {}, all: {}, nir: {}}},
                includedBands
            }
        })
        const addButton = imageForm.renderIncludedBands().props.children.props.inlineComponents
        const combo = addButton.props.children(vi.fn())
        const addAll = combo.props.options.find(
            ({label}) => label === 'process.classification.panel.inputImagery.bandSetSpec.addBands.all.label'
        )

        combo.props.onChange(addAll)

        const updatedBands = includedBands.set.mock.calls[0][0]
        expect(updatedBands[0]).toBe(existingBand)
        expect(updatedBands.map(({name}) => name)).toEqual(['red', 'all', 'nir'])
    })
})

// Selecting a different image is not a refresh of the same one. The bands already configured were chosen
// against the previous source; those the new source does not have describe nothing, and leaving them in the
// list presents them as valid selections.
describe('ImageForm on a source change', () => {
    const spec = (id, name) => ({id, name, type: 'continuous', legendEntries: []})

    const form = ({configured, selected = 'asset-2', loadedId} = {}) => {
        const includedBands = {value: configured, set: vi.fn()}
        const bands = {value: {}, set: vi.fn()}
        const visualizations = {set: vi.fn()}
        const recipe = {set: vi.fn()}
        const imageForm = new ImageForm({
            form: {isDirty: () => true},
            input: {value: selected},
            inputs: {bands, includedBands, visualizations, recipe}
        })
        imageForm.setState = state => Object.assign(imageForm.state, state)
        if (loadedId) {
            imageForm.state.loadedId = loadedId
        }
        return {imageForm, includedBands, bands}
    }

    it('drops a configured band the new source does not have', () => {
        const {imageForm, includedBands} = form({
            configured: [spec('a', 'VV'), spec('b', 'gone')],
            loadedId: 'asset-1'
        })

        imageForm.onLoaded('asset-2', {VV: {}, VH: {}}, [], {id: 'asset-2'})

        expect(includedBands.set).toHaveBeenCalledWith([expect.objectContaining({id: 'a'})])
    })

    it('keeps one the new source still has', () => {
        const {imageForm, includedBands} = form({configured: [spec('a', 'VV')], loadedId: 'asset-1'})

        imageForm.onLoaded('asset-2', {VV: {}, VH: {}}, [], {id: 'asset-2'})

        expect(includedBands.set).not.toHaveBeenCalled()
    })

    it('configures a first band when nothing configured survives the change', () => {
        const {imageForm, includedBands} = form({configured: [spec('a', 'gone')], loadedId: 'asset-1'})

        imageForm.onLoaded('asset-2', {VV: {}, VH: {}}, [], {id: 'asset-2'})

        expect(includedBands.set).toHaveBeenLastCalledWith([expect.objectContaining({name: 'VV'})])
    })

    // Reloading the same source is not a change, and must not undo a deliberate clearing.
    it('adds nothing back when the same source is loaded again', () => {
        const {imageForm, includedBands} = form({configured: [], loadedId: 'asset-2'})

        imageForm.onLoaded('asset-2', {VV: {}, VH: {}}, [], {id: 'asset-2'})

        expect(includedBands.set).not.toHaveBeenCalled()
    })

    it('configures a first band on the first load, as before', () => {
        const {imageForm, includedBands} = form({configured: []})

        imageForm.onLoaded('asset-2', {VV: {}, VH: {}}, [], {id: 'asset-2'})

        expect(includedBands.set).toHaveBeenCalledWith([expect.objectContaining({name: 'VV'})])
    })

    // Two loads can be in flight when the user changes their mind, and they need not answer in order.
    it('ignores an answer about a source that is no longer selected', () => {
        const {imageForm, includedBands, bands} = form({
            configured: [spec('a', 'VV')],
            selected: 'asset-2',
            loadedId: 'asset-1'
        })

        imageForm.onLoaded('asset-1', {other: {}}, [], {id: 'asset-1'})

        expect(bands.set).not.toHaveBeenCalled()
        expect(includedBands.set).not.toHaveBeenCalled()
    })

    // A source that reports no bands shows no band list at all, so there is nothing to reconcile against
    // and nothing to add.
    it('leaves what is configured alone when the source reports no bands', () => {
        const {imageForm, includedBands, bands} = form({configured: [spec('a', 'VV')], loadedId: 'asset-1'})

        imageForm.onLoaded('asset-2', {}, [], {id: 'asset-2'})

        expect(bands.set).toHaveBeenCalledWith({})
        expect(includedBands.set).not.toHaveBeenCalled()
    })
})
