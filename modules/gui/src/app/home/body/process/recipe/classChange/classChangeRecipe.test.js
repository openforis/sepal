import {describe, expect, it, vi} from 'vitest'

vi.mock('~/app/home/body/process/recipe', () => ({recipeActionBuilder: () => {}}))

const {hasConfidence} = await import('./classChangeRecipe')

describe('whether the saved snapshots suggest a confidence can be computed', () => {
    it('reads each image\'s classes from its own snapshot, whatever its class band is called', () => {
        const recipe = classChange({
            fromImage: image('class', {class: [1, 2]}),
            toImage: image('landcover', {landcover: [1, 2]})
        })

        expect(hasConfidence(recipe)).toBe(true)
    })

    it('does not, when the images hold different classes', () => {
        const recipe = classChange({
            fromImage: image('class', {class: [1, 2]}),
            toImage: image('landcover', {landcover: [1, 3]})
        })

        expect(hasConfidence(recipe)).toBe(false)
    })
})

const image = (band, valuesByBand) => ({
    band,
    bands: {
        ...Object.fromEntries(Object.entries(valuesByBand).map(([name, values]) => [name, {values}])),
        probability_1: {},
        probability_2: {},
        probability_3: {}
    }
})

const classChange = model => ({model})
