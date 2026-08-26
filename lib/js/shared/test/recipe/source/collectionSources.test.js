import {collectionType, OPTICAL, PLANET, RADAR} from '#sepal/recipe/collectionType'
import {fromCollectionSources} from '#sepal/recipe/source/collectionSources'

// The shared `sources` submodel, tested once. Five recipe types declare it through this helper - CCDC, Time
// Series, Phenology, Change Alerts and LandTrendr - and they inherit what is asserted here rather than each
// repeating it.

const LANDSAT = {LANDSAT: ['LANDSAT_9', 'LANDSAT_8']}
const SENTINEL_2 = {SENTINEL_2: ['SENTINEL_2']}
const SENTINEL_1 = {SENTINEL_1: ['SENTINEL_1']}
const PLANET_BASEMAPS = {PLANET: ['BASEMAPS']}

const STALE_ASSETS = ['projects/p/assets/basemaps-a', 'projects/p/assets/basemaps-b']

const model = ({dataSets, assets, classification}) => ({
    sources: {
        cloudPercentageThreshold: 75,
        dataSets,
        ...(assets ? {assets} : {}),
        ...(classification ? {classification} : {})
    }
})

const roles = results => results.filter(({edge}) => edge).map(({edge: {role}}) => role)

const assetIds = results => results
    .filter(({edge}) => edge?.role === 'SOURCE_IMAGERY')
    .map(({edge: {reference: {id}}}) => id)

describe('collectionType', () => {
    // Reproduces the conditional collection.js used before it was extracted, including its shape: Planet is
    // the fallback rather than a named case, so anything unrecognized lands there.
    it.each([
        ['exactly Sentinel-1', SENTINEL_1, RADAR],
        ['Landsat', LANDSAT, OPTICAL],
        ['Sentinel-2', SENTINEL_2, OPTICAL],
        ['Landsat and Sentinel-2 together', {...LANDSAT, ...SENTINEL_2}, OPTICAL],
        ['Planet basemaps', PLANET_BASEMAPS, PLANET],
        ['no data sets at all', {}, PLANET],
        ['a data set nothing recognizes', {SOMETHING: ['ELSE']}, PLANET]
    ])('classifies %s', (_name, dataSets, expected) => {
        expect(collectionType(dataSets)).toBe(expected)
    })

    // Sentinel-1 is radar only when it is the WHOLE selection: mixed with an optical data set the collection
    // is built optically, and the old conditional said so by comparing the flattened list.
    it('is not radar when Sentinel-1 is combined with an optical data set', () => {
        expect(collectionType({...SENTINEL_1, ...LANDSAT})).toBe(OPTICAL)
    })

    // Extraction must never throw on a half-written model, so a missing selection takes the fallback. That is
    // a statement about describing the recipe, not about running it: execution still fails later when
    // planetImages reads the data sets it does not have.
    it.each([['undefined', undefined], ['null', null]])('treats %s data sets as the fallback', (_name, dataSets) => {
        expect(collectionType(dataSets)).toBe(PLANET)
    })
})

describe('fromCollectionSources', () => {
    // The panel does not clear `assets` when the data set type changes, so an optical or radar model
    // routinely carries a list left behind by an earlier Planet selection. Only planetImages reads it.
    it('emits no asset edge for an optical model carrying stale assets', () => {
        expect(assetIds(fromCollectionSources(model({dataSets: LANDSAT, assets: STALE_ASSETS})))).toEqual([])
    })

    it('emits no asset edge for a radar model carrying stale assets', () => {
        expect(assetIds(fromCollectionSources(model({dataSets: SENTINEL_1, assets: STALE_ASSETS})))).toEqual([])
    })

    // planet/collection.js merges these in model order, so the order is part of the request.
    it('emits ordered asset edges for a Planet model', () => {
        expect(assetIds(fromCollectionSources(model({dataSets: PLANET_BASEMAPS, assets: STALE_ASSETS}))))
            .toEqual(STALE_ASSETS)
    })

    // collection.js resolves the classification BEFORE choosing a branch, so it is a dependency of every
    // source type. Making it conditional alongside the assets would drop a real dependency.
    it.each([
        ['an optical model', LANDSAT],
        ['a radar model', SENTINEL_1],
        ['a Planet model', PLANET_BASEMAPS]
    ])('emits the Classification edge for %s', (_name, dataSets) => {
        expect(roles(fromCollectionSources(model({dataSets, classification: 'classification-1'}))))
            .toContain('CLASSIFICATION_SOURCE')
    })

    it('emits the classification before the assets it carries', () => {
        const results = fromCollectionSources(
            model({dataSets: PLANET_BASEMAPS, classification: 'classification-1', assets: STALE_ASSETS})
        )
        expect(roles(results)).toEqual(['CLASSIFICATION_SOURCE', 'SOURCE_IMAGERY', 'SOURCE_IMAGERY'])
    })

    it('emits nothing for a model with no sources at all', () => {
        expect(fromCollectionSources({})).toEqual([])
    })
})
