import {jest} from '@jest/globals'
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

jest.unstable_mockModule('#sepal/ee/imageFactory', () => ({
    default: ({id}) => ({
        getGeometry$: () => (captured.aoiResolutions = (captured.aoiResolutions || 0) + 1, of(resolved(id))),
        getImage$: () => of(image())
    })
}))
jest.unstable_mockModule('#sepal/ee/ee', () => ({
    default: {ImageCollection: () => collection(), Image: () => image(), Reducer: {median: () => ({})}}
}))
jest.unstable_mockModule('#sepal/ee/validate', () => ({validateEEImage: ({image}) => image}))
jest.unstable_mockModule('#sepal/ee/asset/mask', () => ({maskImage: img => img}))
jest.unstable_mockModule('#sepal/ee/asset/filter', () => ({createFilter: () => null}))

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

    describe.each([
        ['ASSET', asset],
        ['RECIPE', {type: 'RECIPE', id: 'some-recipe'}]
    ])('with a %s aoi', (_type, aoi) => {
        it('clips with the asynchronously resolved geometry', async () => {
            await firstValueFrom(imageAsset(recipe(aoi)).getImage$())

            expect(captured.clip).toBe(resolved(aoi.id))
            expect(captured.aoiResolutions).toBe(1)
        })
    })

    describe.each([
        ['an absent', recipeWithoutAoi],
        ['an explicit null', () => recipe(null)]
    ])('with %s aoi', (_case, toRecipe) => {
        it('emits the source geometry without clipping or resolving an aoi', async () => {
            const geometry = await firstValueFrom(imageAsset(toRecipe()).getGeometry$())

            expect(geometry).toBe(sourceBounds)
            expect(captured.clip).toBeUndefined()
            expect(captured.aoiResolutions).toBe(0)
        })
    })

    it('leaves an ASSET_BOUNDS aoi unclipped, keeping the source bounds', async () => {
        const geometry = await firstValueFrom(imageAsset(recipe({type: 'ASSET_BOUNDS'})).getGeometry$())

        expect(geometry).toBe(sourceBounds)
        expect(captured.clip).toBeUndefined()
        expect(captured.aoiResolutions).toBe(0)
    })

    it('clips with a runtime GEOMETRY payload by identity without resolving another aoi', async () => {
        await firstValueFrom(imageAsset(recipe({type: 'GEOMETRY', geometry: runtimeGeometry})).getImage$())

        expect(captured.clip).toBe(runtimeGeometry)
        expect(captured.aoiResolutions).toBe(0)
    })

    it('rejects a malformed non-null aoi with the controlled unsupported-type message', async () => {
        await expect(
            firstValueFrom(imageAsset(recipe({})).getImage$())
        ).rejects.toThrow('Unsupported aoi type: undefined')

        expect(captured.clip).toBeUndefined()
        expect(captured.aoiResolutions).toBe(0)
    })
})

describe('image collection asset', () => {
    beforeEach(() => {
        captured.clip = captured.filterBounds = undefined
        captured.aoiResolutions = 0
    })

    describe.each([
        ['ASSET', {type: 'ASSET', id: 'some/asset'}],
        ['RECIPE', {type: 'RECIPE', id: 'some-recipe'}]
    ])('with a %s aoi', (_type, aoi) => {
        it('emits the resolved geometry, never the descriptor', async () => {
            const geometry = await firstValueFrom(imageCollectionAsset(recipe(aoi)).getGeometry$())

            expect(geometry).toBe(resolved(aoi.id))
            expect(geometry).not.toBe(aoi)
            expect(captured.aoiResolutions).toBe(1)
        })

        it('filters and clips with that same resolved geometry', async () => {
            await firstValueFrom(imageCollectionAsset(recipe(aoi)).getImage$())

            expect(captured.filterBounds).toBe(resolved(aoi.id))
            expect(captured.clip).toBe(resolved(aoi.id))
            expect(captured.aoiResolutions).toBe(1)
        })
    })

    describe.each([
        ['an absent', recipeWithoutAoi],
        ['an explicit null', () => recipe(null)]
    ])('with %s aoi', (_case, toRecipe) => {
        it('emits null and composes without filtering, clipping, or resolving an aoi', async () => {
            const assetFactory = imageCollectionAsset(toRecipe())

            await expect(firstValueFrom(assetFactory.getGeometry$())).resolves.toBeNull()
            await firstValueFrom(assetFactory.getImage$())

            expect(captured.filterBounds).toBeUndefined()
            expect(captured.clip).toBeUndefined()
            expect(captured.aoiResolutions).toBe(0)
        })
    })

    describe('with an ASSET_BOUNDS aoi', () => {
        const assetBounds = recipe({type: 'ASSET_BOUNDS'})

        it('takes its geometry from the source collection', async () => {
            expect(await firstValueFrom(imageCollectionAsset(assetBounds).getGeometry$())).toBe(sourceBounds)
        })

        it('clips with the source bounds, without filtering or resolving an aoi', async () => {
            await firstValueFrom(imageCollectionAsset(assetBounds).getImage$())

            expect(captured.clip).toBe(sourceBounds)
            expect(captured.filterBounds).toBeUndefined()
            expect(captured.aoiResolutions).toBe(0)
        })
    })

    it('uses a runtime GEOMETRY payload by identity without resolving another aoi', async () => {
        const assetFactory = imageCollectionAsset(recipe({type: 'GEOMETRY', geometry: runtimeGeometry}))

        await expect(firstValueFrom(assetFactory.getGeometry$())).resolves.toBe(runtimeGeometry)
        await firstValueFrom(assetFactory.getImage$())

        expect(captured.filterBounds).toBe(runtimeGeometry)
        expect(captured.clip).toBe(runtimeGeometry)
        expect(captured.aoiResolutions).toBe(0)
    })

    it('rejects a malformed non-null aoi with the controlled unsupported-type message', async () => {
        await expect(
            firstValueFrom(imageCollectionAsset(recipe({})).getImage$())
        ).rejects.toThrow('Unsupported aoi type: undefined')

        expect(captured.filterBounds).toBeUndefined()
        expect(captured.clip).toBeUndefined()
        expect(captured.aoiResolutions).toBe(0)
    })
})
