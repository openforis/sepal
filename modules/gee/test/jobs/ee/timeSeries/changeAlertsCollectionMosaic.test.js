import {jest} from '@jest/globals'
import {firstValueFrom, of} from 'rxjs'

// What a Change Alerts mosaic mode executes: the mosaic its product is described as, over the geometry of the reference
// it selected. The mosaics and the reference's images are substituted: each mosaic records the recipe it was built from,
// and each image states whose geometry it is. Which pixels real imagery holds is the live verifier's
// (verify/changeAlertsCollectionMosaic.mjs).

const mosaics = []
const MOSAIC_TYPES = new Set(['MOSAIC', 'RADAR_MOSAIC', 'PLANET_MOSAIC'])

const mosaic = {
    getImage$: () => of('mosaic-image'),
    getBands$: () => of(['mosaic-band']),
    getVisParams$: () => of({}),
    getGeometry$: () => of('mosaic-geometry')
}

const imageOf = owner => ({
    getImage$: () => of(`${owner} image`),
    getBands$: () => of([]),
    getGeometry$: () => of({geometryOf: owner})
})

const RECORDS = {
    'ccdc-1': {id: 'ccdc-1', type: 'CCDC', model: {ccdcOptions: {dateFormat: 1}}},
    'masked-ccdc': {
        id: 'masked-ccdc',
        type: 'MASKING',
        model: {imageToMask: {type: 'RECIPE_REF', id: 'ccdc-1'}, imageMask: {type: 'ASSET', id: 'users/x/mask'}}
    }
}

const imageFactory = jest.fn(recipe => {
    if (MOSAIC_TYPES.has(recipe.type)) {
        mosaics.push(recipe)
        return mosaic
    }
    if (recipe.type === 'RECIPE_REF') {
        const image = imageOf(recipe.id)
        return {...image, withRecord$: derive => of(derive(RECORDS[recipe.id], () => image))}
    }
    return imageOf(recipe.id)
})

jest.unstable_mockModule('#sepal/ee/imageFactory', () => ({default: imageFactory}))

const {default: changeAlerts} = await import('#sepal/ee/timeSeries/changeAlerts')
const {recipeType} = await import('#sepal/recipe/recipeTypeRegistry')

beforeEach(() => {
    imageFactory.mockClear()
    mosaics.length = 0
})

describe.each([
    ['optical', {band: 'ndvi', dataSetType: 'OPTICAL', dataSets: {LANDSAT: ['LANDSAT_8']}, cloudPercentageThreshold: 75}],
    ['radar', {band: 'VV', dataSetType: 'RADAR', dataSets: {SENTINEL_1: ['SENTINEL_1']}}],
    ['Planet', {band: 'ndvi', dataSetType: 'PLANET', dataSets: {PLANET: ['DAILY']}, assets: ['users/x/daily']}]
])('a Change Alerts %s mosaic mode', (_case, sources) => {
    it.each([
        ['monitoring', 'latest'],
        ['monitoring', 'median'],
        ['calibration', 'latest'],
        ['calibration', 'median']
    ])('builds the %s %s mosaic it is described as, over the geometry of the CCDC it monitors', async (period, mosaicType) => {
        const recipe = changeAlertsRecipe({sources})

        await firstValueFrom(changeAlerts(recipe, {visualizationType: period, mosaicType}).getImage$())

        expect(mosaics).toEqual([withArea(describedMosaic(recipe, {period, mosaicType}), {geometryOf: 'ccdc-1'})])
    })
})

describe('the area a Change Alerts mosaic is built over', () => {
    it('is the geometry of the wrapper it selected, not of the CCDC under it', async () => {
        const recipe = changeAlertsRecipe({reference: {type: 'RECIPE_REF', id: 'masked-ccdc'}})

        await firstValueFrom(changeAlerts(recipe, {visualizationType: 'calibration', mosaicType: 'median'}).getImage$())

        expect(mosaics.map(({model: {aoi}}) => aoi)).toEqual([{type: 'GEOMETRY', geometry: {geometryOf: 'masked-ccdc'}}])
    })

    it('is the geometry of a segments asset it selected', async () => {
        const recipe = changeAlertsRecipe({reference: {type: 'ASSET', id: 'users/x/segments', dateFormat: 1}})

        await firstValueFrom(changeAlerts(recipe, {visualizationType: 'monitoring', mosaicType: 'latest'}).getImage$())

        expect(mosaics.map(({model: {aoi}}) => aoi)).toEqual([{type: 'GEOMETRY', geometry: {geometryOf: 'users/x/segments'}}])
    })

    it('scans the calibration period it is described over', async () => {
        const recipe = changeAlertsRecipe({sources: {band: 'VV', dataSetType: 'RADAR', dataSets: {SENTINEL_1: ['SENTINEL_1']}}})

        await firstValueFrom(changeAlerts(recipe, {visualizationType: 'calibration', mosaicType: 'median'}).getImage$())

        expect(mosaics.map(({model: {dates: {fromDate, toDate}}}) => ({fromDate, toDate})))
            .toEqual([{fromDate: '2023-08-01', toDate: '2023-11-01'}])
    })
})

const changeAlertsRecipe = ({
    reference = {type: 'RECIPE_REF', id: 'ccdc-1'},
    sources = {band: 'ndvi', dataSetType: 'OPTICAL', dataSets: {LANDSAT: ['LANDSAT_8']}}
} = {}) => ({
    id: 'change-alerts-1',
    type: 'CHANGE_ALERTS',
    model: {
        reference,
        sources,
        options: {corrections: ['SR'], orbits: ['ASCENDING'], histogramMatching: 'DISABLED'},
        date: {
            monitoringEnd: '2024-01-01', monitoringDuration: 2, monitoringDurationUnit: 'months',
            calibrationDuration: 3, calibrationDurationUnit: 'months'
        },
        changeAlertsOptions: {}
    }
})

// The mosaic the product asks another type to describe.
const describedMosaic = (recipe, parameters) => {
    const delegated = []
    recipeType('CHANGE_ALERTS').mapProducts.COLLECTION_MOSAIC.describe({
        recipe,
        parameters,
        delegate: mosaic => {
            delegated.push(mosaic)
            return {bands: [], evidence: []}
        }
    })
    return delegated[0]
}

const withArea = (mosaic, geometry) => ({...mosaic, model: {aoi: {type: 'GEOMETRY', geometry}, ...mosaic.model}})
