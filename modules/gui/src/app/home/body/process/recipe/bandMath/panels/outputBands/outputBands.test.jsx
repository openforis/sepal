import {describe, expect, it, vi} from 'vitest'

vi.mock('~/app/home/body/process/recipeFormPanel', () => ({
    RecipeFormPanel: ({children}) => children,
    recipeFormPanel: () => Component => Component
}))
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
        const outputBands = new OutputBands({inputs: {outputImages}})
        outputBands.updateAllOutputBandNames = vi.fn()

        outputBands.addBand({value: 'all', image, band: allBand})

        expect(outputImages.set).toHaveBeenCalledWith([{
            ...image,
            outputBands: [{...allBand, defaultOutputName: 'all'}]
        }])
    })
})
