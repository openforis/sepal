import assert from 'node:assert/strict'
import {beforeEach, describe, it, mock} from 'node:test'

import {firstValueFrom, of} from 'rxjs'

// An ASSET or RECIPE aoi is a descriptor, not a geometry. Earth Engine only ever sees a geometry once
// imageFactory has resolved it, so the fake resolves to a value the descriptor could never be mistaken for.
const resolvedById = {}
const resolved = id => resolvedById[id] || (resolvedById[id] = {resolvedFrom: id, bounds: () => 'bounds'})

mock.module('#sepal/ee/imageFactory', {
    exports: {
        default: ({id}) => ({getGeometry$: () => of(resolved(id))})
    }
})
mock.module('#sepal/recipe/migrate', {
    exports: {
        migrate: recipe => recipe
    }
})
mock.module('#sepal/ee/validate', {
    exports: {
        validateEEImage: ({image}) => image
    }
})
mock.module('#sepal/ee/optical/addTasseledCap', {
    exports: {
        default: image => image
    }
})
mock.module('#sepal/ee/optical/composite', {
    exports: {
        toComposite: ({collection}) => collection
    }
})

const captured = {}
const fakeCollection = {
    limit: () => ({size: () => 1}),
    select: () => ({clip: geometry => (captured.clip = geometry, 'image')})
}
mock.module('#sepal/ee/optical/collection', {
    exports: {
        allScenes: args => (captured.allScenes = args, fakeCollection),
        selectedScenes: args => (captured.selectedScenes = args, fakeCollection),
        findCommonBands: () => []
    }
})

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

for (const [scenario, aoi] of [
    ['ASSET', {type: 'ASSET', id: 'some/asset'}],
    ['RECIPE', {type: 'RECIPE', id: 'some-recipe'}]
]) {
    describe(`optical mosaic with a ${scenario} aoi`, () => {
        beforeEach(() => {
            captured.allScenes = captured.selectedScenes = captured.clip = undefined
        })

        it('emits the resolved geometry, never the descriptor', async () => {
            const geometry = await firstValueFrom(opticalMosaic(recipe(aoi)).getGeometry$())

            assert.equal(geometry, resolved(aoi.id))
            assert.notEqual(geometry, aoi)
        })

        it('builds the collection from the resolved geometry', async () => {
            await firstValueFrom(opticalMosaic(recipe(aoi), {selection: []}).getImage$())

            assert.equal(captured.allScenes.geometry, resolved(aoi.id))
        })

        it('clips with the resolved geometry', async () => {
            await firstValueFrom(opticalMosaic(recipe(aoi), {selection: []}).getImage$())

            assert.equal(captured.clip, resolved(aoi.id))
        })
    })
}
