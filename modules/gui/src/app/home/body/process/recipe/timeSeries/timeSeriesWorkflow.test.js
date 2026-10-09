import {beforeEach, describe, expect, it, vi} from 'vitest'

// What a time series is used for, which declaring its count map must leave as it was: it is kept out of other
// recipes' source pickers, and its Retrieve downloads a measure of its collection to SEPAL. Through the real
// registration and the real task submission; only the task API and what they report to are replaced.

vi.mock('~/translate', () => ({msg: key => (Array.isArray(key) ? key.join('.') : key)}))
// Loading the recipe types closes an import cycle through the user module's forms; nothing here reads it.
vi.mock('~/user', () => ({}))
vi.mock('~/eventPublisher', () => ({publishEvent: () => {}}))
vi.mock('~/app/home/body/process/recipe/recipeOutputPath', () => ({getTaskInfo: () => ({})}))

const submitted = vi.hoisted(() => [])
vi.mock('~/apiRegistry', () => ({
    default: {
        tasks: {
            submit$: task => {
                submitted.push(task)
                return {subscribe: () => {}}
            }
        }
    }
}))

const {default: timeSeries} = await import('./timeSeries')
const {submitRetrieveRecipeTask} = await import('./timeSeriesRecipe')
const {maskableImage, maskImage} = await import('../masking/panels/inputImage/recipeSection')

beforeEach(() => {
    submitted.length = 0
})

describe('a time series', () => {
    it('is offered to a Masking neither as the image to mask nor as its mask', () => {
        const registration = timeSeries()

        expect(maskableImage(registration, {type: 'TIME_SERIES'})).toBe(false)
        expect(maskImage(registration)).toBe(false)
    })

    it('downloads the indicator its Retrieve names to SEPAL, from its collection', () => {
        const recipe = {
            id: 'time-series-1',
            type: 'TIME_SERIES',
            title: 'Observations',
            model: {sources: {dataSets: {LANDSAT: ['LANDSAT_8']}}},
            ui: {retrieveOptions: {bands: 'ndvi', scale: 30, tileSize: 2}}
        }

        submitRetrieveRecipeTask(recipe)

        expect(submitted).toEqual([expect.objectContaining({
            operation: 'timeseries.download',
            params: expect.objectContaining({
                title: 'process.retrieve.form.task.SEPAL',
                image: {bands: 'ndvi', scale: 30, tileSize: 2, recipe, indicators: 'ndvi'}
            })
        })])
    })
})
