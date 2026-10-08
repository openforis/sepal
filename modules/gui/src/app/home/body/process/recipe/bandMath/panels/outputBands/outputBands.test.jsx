import {describe, expect, it, vi} from 'vitest'

vi.mock('~/app/home/body/process/recipeFormPanel', () => ({
    RecipeFormPanel: ({children}) => children,
    recipeFormPanel: () => Component => Component
}))
vi.mock('../../../selectedSource', () => ({withItemProblems: () => Component => Component}))
vi.mock('~/translate', () => ({msg: key => key}))
vi.mock('~/widget/form', () => {
    class Property {
        notEmpty() {
            return this
        }

        match() {
            return this
        }

        predicate() {
            return this
        }
    }

    return {Form: {Constraint: Property, Field: Property}}
})

import {OutputBands} from './outputBands'

describe('OutputBands band selection', () => {
    it('adds a band named all without treating it as the add-all command', () => {
        const allBand = {id: 'all-id', name: 'all'}
        const redBand = {id: 'red-id', name: 'red'}
        const image = {
            imageId: 'image-id',
            includedBands: [allBand, redBand],
            outputBands: []
        }
        const outputImages = {
            value: [image],
            set: vi.fn()
        }
        const outputBands = new OutputBands({inputs: {outputImages}, images: [image]})

        outputBands.addBand({value: 'all', image, band: allBand})

        expect(outputImages.set).toHaveBeenCalledWith([{
            ...image,
            outputBands: [{...allBand, defaultOutputName: 'all'}]
        }])
    })

    // A choice the picker offered before the image came to output the band, as a saved recipe's legacy copy does.
    it('adds no band its image already outputs under a legacy id', () => {
        const redBand = {id: 'red-id', name: 'red'}
        const image = {
            imageId: 'image-id',
            includedBands: [redBand],
            outputBands: [{id: 'legacy-red-id', name: 'red', defaultOutputName: 'red'}]
        }
        const outputImages = {
            value: [image],
            set: vi.fn()
        }
        const outputBands = new OutputBands({inputs: {outputImages}, images: [image]})

        outputBands.addBand({value: 'red', image, band: redBand})

        expect(outputImages.set).toHaveBeenCalledWith([image])
    })

    // Choices the picker offered while the input still included a band, chosen once it no longer does: the output
    // image's saved copy of the input's bands still lists it.
    it.each([
        ['alone', ([_addAll, red]) => red],
        ['among all', ([addAll]) => addAll]
    ])('adds no band its input no longer includes, chosen %s', (_case, choose) => {
        const redBand = {id: 'red-id', name: 'red'}
        const nirBand = {id: 'nir-id', name: 'nir'}
        const image = {imageId: 'image-id', includedBands: [redBand, nirBand], outputBands: []}
        const outputImages = {value: [image], set: vi.fn()}
        const outputBands = new OutputBands({inputs: {outputImages}, images: [image]})
        const offered = outputBands.renderAddBandButton(image, image).props.children(() => {}).props.options
        outputBands.props = {...outputBands.props, images: [{...image, includedBands: [nirBand]}]}

        outputBands.addBand(choose(offered))

        const [{outputBands: added}] = outputImages.set.mock.calls[0][0]
        expect(added.map(({name}) => name)).not.toContain('red')
    })

    // Choices the picker offered before a band of the input was renamed, chosen once it is.
    it.each([
        ['alone', ([_addAll, red]) => red],
        ['among all', ([addAll]) => addAll]
    ])('adds a band renamed since it was offered under its current name, chosen %s', (_case, choose) => {
        const redBand = {id: 'red-id', name: 'red'}
        const nirBand = {id: 'nir-id', name: 'nir'}
        const image = {imageId: 'image-id', includedBands: [redBand, nirBand], outputBands: []}
        const outputImages = {value: [image], set: vi.fn()}
        const outputBands = new OutputBands({inputs: {outputImages}, images: [image]})
        const offered = outputBands.renderAddBandButton(image, image).props.children(() => {}).props.options
        const renamed = {...image, includedBands: [{...redBand, name: 'swir'}, nirBand]}
        outputBands.props = {...outputBands.props, images: [renamed]}

        outputBands.addBand(choose(offered))

        const [saved] = outputImages.set.mock.calls[0][0]
        expect(saved.outputBands.find(({id}) => id === redBand.id)).toEqual(expect.objectContaining({name: 'swir'}))
        expect(saved.includedBands).toEqual(renamed.includedBands)
    })
})
