import {describe, expect, it, vi} from 'vitest'

// Which recipes the pickers offering recipes as images - input imagery, a map layer's source, an area of interest -
// may offer, over the real registrations. Eligibility is stated per type, apart from what a type declares it outputs:
// CCDC and Time Series declare images and are still not offered.

vi.mock('~/translate', () => ({msg: key => (Array.isArray(key) ? key.join('.') : key)}))
// Loading the recipe types closes an import cycle through the user module's forms; nothing here reads it.
vi.mock('~/user', () => ({}))

const {addRecipeType, getRecipeType, isImageSource, listRecipeTypes} = await import('./recipeTypeRegistry')
const {registerRecipeTypes} = await import('./recipeTypes')
const {maskableImage, maskImage} = await import('./recipe/masking/panels/inputImage/recipeSection')

registerRecipeTypes()

describe('the recipe types offered as images', () => {
    it('are every registered type but CCDC, Time Series and Sampling Design', () => {
        const excluded = listRecipeTypes().filter(type => !isImageSource(type)).map(({id}) => id)

        expect(excluded.sort()).toEqual(['CCDC', 'SAMPLING_DESIGN', 'TIME_SERIES'])
        expect(listRecipeTypes()).toHaveLength(23)
    })

    it('are stated by every registration, which is refused without it', () => {
        expect(listRecipeTypes().every(({imageSource}) => typeof imageSource === 'boolean')).toBe(true)
        expect(() => addRecipeType({id: 'UNSTATED'})).toThrow(/UNSTATED must state whether it is an image source/)
        expect(getRecipeType('UNSTATED')).toBeUndefined()
    })
})

// Masking preserves what it masks, so a source of segments stays one through it.
describe('what Masking offers', () => {
    const offeredToMask = id => maskableImage(getRecipeType(id), {id: 'recipe-1', type: id})

    it('masks CCDC, a source of segments, though CCDC is offered as no image elsewhere', () => {
        expect(offeredToMask('CCDC')).toBe(true)
        expect(maskImage(getRecipeType('CCDC'))).toBe(false)
    })

    it('masks neither a Time Series nor a Sampling Design, and masks by neither', () => {
        ['TIME_SERIES', 'SAMPLING_DESIGN'].forEach(id => {
            expect(offeredToMask(id)).toBe(false)
            expect(maskImage(getRecipeType(id))).toBe(false)
        })
    })

    it('masks and masks by any image source', () => {
        expect(offeredToMask('MOSAIC')).toBe(true)
        expect(maskImage(getRecipeType('MOSAIC'))).toBe(true)
    })
})
