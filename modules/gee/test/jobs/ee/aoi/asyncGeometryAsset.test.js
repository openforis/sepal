import assert from 'node:assert/strict'
import {beforeEach, describe, it, mock} from 'node:test'

import {firstValueFrom, of} from 'rxjs'

// Asset factories keep ASSET_BOUNDS source-owned, resolve valid descriptors, and leave missing AOIs
// unrestricted.
const resolvedById = {}
const resolved = id => resolvedById[id] || (resolvedById[id] = {resolvedFrom: id, bounds: () => 'bounds'})

const captured = {}
const sourceBounds = {sourceBounds: true}
const runtimeGeometry = {
    type() {
        return 'Polygon'
    }
}

const image = () => ({
    clip: geometry => (captured.clip = geometry, image()),
    select: () => image(),
    addBands: () => image(),
    copyProperties: () => image(),
    bandNames: () => ['band'],
    set: () => image(),
    geometry: () => sourceBounds
})

const collection = () => ({
    filterBounds: geometry => (captured.filterBounds = geometry, collection()),
    filterDate: () => collection(),
    filter: () => collection(),
    map: () => collection(),
    select: () => collection(),
    merge: () => collection(),
    first: () => image(),
    median: () => image(),
    mosaic: () => image(),
    limit: () => ({size: () => 1}),
    geometry: () => ({bounds: () => sourceBounds})
})

mock.module('#sepal/ee/imageFactory', {
    exports: {
        default: ({id}) => ({
            getGeometry$: () => (captured.aoiResolutions = (captured.aoiResolutions || 0) + 1, of(resolved(id))),
            getImage$: () => of(image())
        })
    }
})
mock.module('#sepal/ee/ee', {
    exports: {
        default: {ImageCollection: () => collection(), Image: () => image(), Reducer: {median: () => ({})}}
    }
})
mock.module('#sepal/ee/validate', {
    exports: {
        validateEEImage: ({image}) => image
    }
})
mock.module('#sepal/ee/asset/mask', {
    exports: {
        maskImage: img => img
    }
})
mock.module('#sepal/ee/asset/filter', {
    exports: {
        createFilter: () => null
    }
})

const {default: imageAsset} = await import('#sepal/ee/asset/imageAsset')
const {default: imageCollectionAsset} = await import('#sepal/ee/asset/imageCollectionAsset')

const asset = {type: 'ASSET', id: 'some/asset'}
const recipe = aoi => ({model: {aoi, assetDetails: {assetId: 'the/asset'}, dates: {type: 'ALL_DATES'}}})
const recipeWithoutAoi = () => ({
    model: {assetDetails: {assetId: 'the/asset'}, dates: {type: 'ALL_DATES'}}
})

describe('image asset', () => {
    beforeEach(() => {
        captured.clip = undefined
        captured.aoiResolutions = 0
    })

    for (const [typeName, aoi] of [
        ['ASSET', asset],
        ['RECIPE', {type: 'RECIPE', id: 'some-recipe'}]
    ]) {
        describe(`with a ${typeName} aoi`, () => {
            it('clips with the asynchronously resolved geometry', async () => {
                await firstValueFrom(imageAsset(recipe(aoi)).getImage$())

                assert.equal(captured.clip, resolved(aoi.id))
                assert.equal(captured.aoiResolutions, 1)
            })
        })
    }

    for (const [scenario, toRecipe] of [
        ['an absent', recipeWithoutAoi],
        ['an explicit null', () => recipe(null)]
    ]) {
        describe(`with ${scenario} aoi`, () => {
            it('emits the source geometry without clipping or resolving an aoi', async () => {
                const geometry = await firstValueFrom(imageAsset(toRecipe()).getGeometry$())

                assert.equal(geometry, sourceBounds)
                assert.equal(captured.clip, undefined)
                assert.equal(captured.aoiResolutions, 0)
            })
        })
    }

    it('leaves an ASSET_BOUNDS aoi unclipped, keeping the source bounds', async () => {
        const geometry = await firstValueFrom(imageAsset(recipe({type: 'ASSET_BOUNDS'})).getGeometry$())

        assert.equal(geometry, sourceBounds)
        assert.equal(captured.clip, undefined)
        assert.equal(captured.aoiResolutions, 0)
    })

    it('clips with a runtime GEOMETRY payload by identity without resolving another aoi', async () => {
        await firstValueFrom(imageAsset(recipe({type: 'GEOMETRY', geometry: runtimeGeometry})).getImage$())

        assert.equal(captured.clip, runtimeGeometry)
        assert.equal(captured.aoiResolutions, 0)
    })

    it('rejects a malformed non-null aoi with the controlled unsupported-type message', async () => {
        await assert.rejects(
            firstValueFrom(imageAsset(recipe({})).getImage$()),
            /Unsupported aoi type: undefined/
        )

        assert.equal(captured.clip, undefined)
        assert.equal(captured.aoiResolutions, 0)
    })
})

describe('image collection asset', () => {
    beforeEach(() => {
        captured.clip = captured.filterBounds = undefined
        captured.aoiResolutions = 0
    })

    for (const [typeName, aoi] of [
        ['ASSET', {type: 'ASSET', id: 'some/asset'}],
        ['RECIPE', {type: 'RECIPE', id: 'some-recipe'}]
    ]) {
        describe(`with a ${typeName} aoi`, () => {
            it('emits the resolved geometry, never the descriptor', async () => {
                const geometry = await firstValueFrom(imageCollectionAsset(recipe(aoi)).getGeometry$())

                assert.equal(geometry, resolved(aoi.id))
                assert.notEqual(geometry, aoi)
                assert.equal(captured.aoiResolutions, 1)
            })

            it('filters and clips with that same resolved geometry', async () => {
                await firstValueFrom(imageCollectionAsset(recipe(aoi)).getImage$())

                assert.equal(captured.filterBounds, resolved(aoi.id))
                assert.equal(captured.clip, resolved(aoi.id))
                assert.equal(captured.aoiResolutions, 1)
            })
        })
    }

    for (const [scenario, toRecipe] of [
        ['an absent', recipeWithoutAoi],
        ['an explicit null', () => recipe(null)]
    ]) {
        describe(`with ${scenario} aoi`, () => {
            it('emits null and composes without filtering, clipping, or resolving an aoi', async () => {
                const assetFactory = imageCollectionAsset(toRecipe())

                assert.equal(await firstValueFrom(assetFactory.getGeometry$()), null)
                await firstValueFrom(assetFactory.getImage$())

                assert.equal(captured.filterBounds, undefined)
                assert.equal(captured.clip, undefined)
                assert.equal(captured.aoiResolutions, 0)
            })
        })
    }

    describe('with an ASSET_BOUNDS aoi', () => {
        const assetBounds = recipe({type: 'ASSET_BOUNDS'})

        it('takes its geometry from the source collection', async () => {
            assert.equal(
                await firstValueFrom(imageCollectionAsset(assetBounds).getGeometry$()),
                sourceBounds
            )
        })

        it('clips with the source bounds, without filtering or resolving an aoi', async () => {
            await firstValueFrom(imageCollectionAsset(assetBounds).getImage$())

            assert.equal(captured.clip, sourceBounds)
            assert.equal(captured.filterBounds, undefined)
            assert.equal(captured.aoiResolutions, 0)
        })
    })

    it('uses a runtime GEOMETRY payload by identity without resolving another aoi', async () => {
        const assetFactory = imageCollectionAsset(recipe({type: 'GEOMETRY', geometry: runtimeGeometry}))

        assert.equal(await firstValueFrom(assetFactory.getGeometry$()), runtimeGeometry)
        await firstValueFrom(assetFactory.getImage$())

        assert.equal(captured.filterBounds, runtimeGeometry)
        assert.equal(captured.clip, runtimeGeometry)
        assert.equal(captured.aoiResolutions, 0)
    })

    it('rejects a malformed non-null aoi with the controlled unsupported-type message', async () => {
        await assert.rejects(
            firstValueFrom(imageCollectionAsset(recipe({})).getImage$()),
            /Unsupported aoi type: undefined/
        )

        assert.equal(captured.filterBounds, undefined)
        assert.equal(captured.clip, undefined)
        assert.equal(captured.aoiResolutions, 0)
    })
})
