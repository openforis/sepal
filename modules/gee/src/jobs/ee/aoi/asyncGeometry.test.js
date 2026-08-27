import {jest} from '@jest/globals'
import {firstValueFrom, of} from 'rxjs'

// An ASSET or RECIPE aoi is a descriptor, not a geometry. Earth Engine only ever sees a geometry once
// imageFactory has resolved it, so the fake resolves to a value the descriptor could never be mistaken for.
const resolvedById = {}
const resolved = id => resolvedById[id] || (resolvedById[id] = {resolvedFrom: id, bounds: () => 'bounds'})

jest.unstable_mockModule('#sepal/ee/imageFactory', () => ({
    default: ({id}) => ({getGeometry$: () => of(resolved(id))})
}))
jest.unstable_mockModule('#sepal/recipe/migrate', () => ({migrate: recipe => recipe}))
jest.unstable_mockModule('#sepal/ee/validate', () => ({validateEEImage: ({image}) => image}))
jest.unstable_mockModule('#sepal/ee/optical/addTasseledCap', () => ({default: image => image}))
jest.unstable_mockModule('#sepal/ee/optical/composite', () => ({toComposite: ({collection}) => collection}))

const captured = {}
const fakeCollection = {
    limit: () => ({size: () => 1}),
    select: () => ({clip: geometry => (captured.clip = geometry, 'image')})
}
jest.unstable_mockModule('#sepal/ee/optical/collection', () => ({
    allScenes: args => (captured.allScenes = args, fakeCollection),
    selectedScenes: args => (captured.selectedScenes = args, fakeCollection),
    findCommonBands: () => []
}))

const {default: opticalMosaic} = await import('#sepal/ee/optical/mosaic')

const recipe = aoi => ({
    type: 'MOSAIC',
    model: {
        aoi,
        dates: {targetDate: '2020-01-01'},
        sources: {dataSets: {LANDSAT: ['LANDSAT_8']}, cloudPercentageThreshold: 100},
        compositeOptions: {compose: 'MEDOID', corrections: []}
    }
})

describe.each([
    ['ASSET', {type: 'ASSET', id: 'some/asset'}],
    ['RECIPE', {type: 'RECIPE', id: 'some-recipe'}]
])('optical mosaic with a %s aoi', (_type, aoi) => {
    beforeEach(() => {
        captured.allScenes = captured.selectedScenes = captured.clip = undefined
    })

    it('emits the resolved geometry, never the descriptor', async () => {
        const geometry = await firstValueFrom(opticalMosaic(recipe(aoi)).getGeometry$())

        expect(geometry).toBe(resolved(aoi.id))
        expect(geometry).not.toBe(aoi)
    })

    it('builds the collection from the resolved geometry', async () => {
        await firstValueFrom(opticalMosaic(recipe(aoi), {selection: []}).getImage$())

        expect(captured.allScenes.geometry).toBe(resolved(aoi.id))
    })

    it('clips with the resolved geometry', async () => {
        await firstValueFrom(opticalMosaic(recipe(aoi), {selection: []}).getImage$())

        expect(captured.clip).toBe(resolved(aoi.id))
    })
})
