import {describe, expect, it, vi} from 'vitest'

vi.mock('~/translate', () => ({
    msg: id => id
}))

import {ImageForm} from './imageForm'

describe('ImageForm band selection', () => {
    it('adds only the selected band when its name is all', () => {
        const bandSetSpec = {id: 'image-bands', type: 'IMAGE_BANDS', included: []}
        const bandSetSpecs = {
            value: [bandSetSpec],
            set: vi.fn()
        }
        const imageForm = new ImageForm({
            inputs: {
                bands: {value: ['all', 'red']},
                bandSetSpecs
            }
        })
        const popup = imageForm.renderAddButton(bandSetSpec)
        const combo = popup.props.children(vi.fn())
        const allBand = combo.props.options.find(({label}) => label === 'all')

        combo.props.onChange(allBand)

        expect(bandSetSpecs.set).toHaveBeenCalledWith([
            {...bandSetSpec, included: ['all']}
        ])
    })

    it('disables adding bands when all available bands are selected', () => {
        const bandSetSpec = {id: 'image-bands', type: 'IMAGE_BANDS', included: ['red', 'nir']}
        const imageForm = new ImageForm({
            inputs: {
                bands: {value: ['red', 'nir']},
                bandSetSpecs: {value: [bandSetSpec], set: vi.fn()}
            }
        })

        const popup = imageForm.renderAddButton(bandSetSpec)

        expect(popup.props.disabled).toBe(true)
    })

    it('clears Image bands while preserving the required band group', () => {
        const bandSetSpec = {id: 'image-bands', type: 'IMAGE_BANDS', included: ['red', 'nir']}
        const bandSetSpecs = {
            value: [bandSetSpec],
            set: vi.fn()
        }
        const imageForm = new ImageForm({
            inputs: {
                bands: {value: ['red', 'nir']},
                bandSetSpecs
            }
        })
        const collection = imageForm.renderBandSetSpec(bandSetSpec)
        const header = collection.props.children

        header.props.onRemove()

        expect(collection.props.expanded).toBe(true)
        expect(header.props.removeDisabled).toBe(false)
        expect(header.props.removeConfirmationLabel).toBe('button.removeAll')
        expect(bandSetSpecs.set).toHaveBeenCalledWith([
            {...bandSetSpec, included: []}
        ])
    })

    it('keeps an empty Image bands group expanded with a no-selection message', () => {
        const bandSetSpec = {id: 'image-bands', type: 'IMAGE_BANDS', included: []}
        const imageForm = new ImageForm({
            inputs: {
                bands: {value: ['red', 'nir']},
                bandSetSpecs: {value: [bandSetSpec], set: vi.fn()}
            }
        })

        const collection = imageForm.renderBandSetSpec(bandSetSpec)
        const emptyState = collection.props.expansion.props.children

        expect(collection.props.expanded).toBe(true)
        expect(emptyState.props.message).toBe('process.panels.inputImagery.form.noBands')
    })
})
