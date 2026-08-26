import {describe, expect, it, vi} from 'vitest'

vi.mock('~/translate', () => ({msg: id => id}))
vi.mock('./bandSpec', () => ({BandSpec: () => null}))

import {ImageForm} from './imageForm'

describe('ImageForm band collection', () => {
    it('wraps selected bands in an Image bands collection with add and clear actions', () => {
        const includedBands = {
            value: [{id: 'red-id', band: 'red', type: 'continuous', legendEntries: []}],
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
                {id: 'red-id', band: 'red', type: 'continuous', legendEntries: []},
                {id: 'nir-id', band: 'nir', type: 'continuous', legendEntries: []}
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
        const existingBand = {id: 'red-id', band: 'red', type: 'continuous', legendEntries: [], custom: true}
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
        expect(updatedBands.map(({band}) => band)).toEqual(['red', 'all'])
    })

    it('adds every remaining band from the picker bulk action', () => {
        const existingBand = {id: 'red-id', band: 'red', type: 'continuous', legendEntries: [], custom: true}
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
        expect(updatedBands.map(({band}) => band)).toEqual(['red', 'all', 'nir'])
    })

    it('disables the add action when every band is selected', () => {
        const imageForm = new ImageForm({
            inputs: {
                bands: {value: {red: {}}},
                includedBands: {
                    value: [{id: 'red-id', band: 'red', type: 'continuous', legendEntries: []}],
                    set: vi.fn()
                }
            }
        })

        const addButton = imageForm.renderIncludedBands().props.children.props.inlineComponents

        expect(addButton.props.disabled).toBe(true)
    })
})
