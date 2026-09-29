import assert from 'node:assert/strict'
import {beforeEach, describe, it, mock} from 'node:test'

import {firstValueFrom, of, throwError} from 'rxjs'

// Which bands a BAYTS Historical returns, directly and through a Masking, through the REAL imageFactory, recipeRef,
// masking, asset and BAYTS Historical implementations. The radar mosaic each pass is built from, recipe reads and
// Earth Engine are substituted: an image here is its band names, a pass's radar mosaic holds the statistics it was
// asked for, and its multitemporal speckle statistics are whatever a test says that pass supplied. Which bands real
// imagery builds is the live verifier's (verify/baytsHistoricalOutputBands.mjs).
//
// Run by Node's own test runner rather than Jest, because imageFactory loads every implementation through
// createRequire. Launched from a Jest bridge so it still runs in the ordinary gee gate.

let catalogue = {}
let speckleStatsByPass = {}

const eeImage = bands => ({
    bands,
    select: selection => {
        const names = typeof selection === 'number' ? [bands[selection]] : [selection].flat()
        const missing = names.filter(name => !bands.includes(name))
        if (missing.length) {
            throw new Error(`Image.select: Band pattern '${missing[0]}' did not match any bands.`)
        }
        return eeImage(names)
    },
    rename: names => eeImage([names].flat()),
    regexpRename: (pattern, replacement) =>
        eeImage(bands.map(band => band.replace(new RegExp(`^${pattern}$`), replacement))),
    addBands: other => eeImage([...bands, ...other.bands]),
    updateMask: () => eeImage(bands),
    clip: () => eeImage(bands),
    float: () => eeImage(bands),
    geometry: () => ({}),
    get: property => property === 'speckleStatsCollection' ? speckleStatsByPass : undefined
})

// The speckle statistics a pass supplied: its polarisations, or none for a pass without imagery.
const speckleStatsCollection = byPass => ({
    filter: ({value: pass}) => speckleStatsCollection({[pass]: byPass[pass]}),
    map: () => speckleStatsCollection(byPass),
    mosaic: () => eeImage(Object.values(byPass).some(supplied => supplied) ? ['VV', 'VH'] : [])
})

mock.module('#sepal/ee/ee', {
    exports: {
        default: {
            getAsset$: () => of({type: 'Image'}),
            Image: Object.assign(
                value => typeof value === 'string'
                    ? eeImage(['mask'])
                    : Array.isArray(value) ? eeImage(value.flatMap(image => image.bands)) : eeImage(['constant']),
                {cat: (...images) => eeImage(images.flatMap(image => image.bands))}
            ),
            ImageCollection: byPass => speckleStatsCollection(byPass),
            Filter: {eq: (property, value) => ({property, value})}
        }
    }
})

mock.module('#sepal/ee/radar/mosaic', {
    defaultExport: (_recipe, {selection}) => ({getImage$: () => of(eeImage(selection))})
})

const {RecipeScope, withRecipeScope} = await import('#sepal/ee/recipeScope')
const {default: imageFactory} = await import('#sepal/ee/imageFactory')
const {withOutputBands} = await import('#sepal/ee/outputBands')

const inOperation = (name, fn) => it(name, async () => {
    const scope = new RecipeScope(id => catalogue[id] ? of(catalogue[id]) : throwError(() => new Error(`No recipe ${id}`)))
    try {
        await withRecipeScope(scope, fn)
    } finally {
        scope.close()
    }
})

const historical = ({orbits = ['DESCENDING', 'ASCENDING'], multitemporalSpeckleFilter = 'NONE'} = {}) => ({
    id: 'historical-1',
    type: 'BAYTS_HISTORICAL',
    model: {
        aoi: {type: 'POLYGON', path: [[0, 0], [0, 1], [1, 1]]},
        dates: {fromDate: '2023-01-01', toDate: '2024-01-01'},
        options: {orbits, spatialSpeckleFilter: 'LEE', multitemporalSpeckleFilter}
    }
})

const MASKED = {
    id: 'masking-1',
    type: 'MASKING',
    model: {imageToMask: {type: 'RECIPE_REF', id: 'historical-1'}, imageMask: {type: 'ASSET', id: 'users/x/mask'}}
}

const passBands = suffix => ['VV_mean', 'VV_std', 'VH_mean', 'VH_std', 'orbit', 'VV_speckle', 'VH_speckle']
    .map(statistic => `${statistic}_${suffix}`)

const bands = async (recipe, args) => (await firstValueFrom(imageFactory(recipe, args).getImage$())).bands

beforeEach(() => {
    catalogue = {'historical-1': historical()}
    speckleStatsByPass = {}
})

describe('a BAYTS Historical asked for no output bands', () => {
    // A bare selection is not a request for bands, whatever it names.
    for (const [label, args] of [['nothing', undefined], ['an empty selection', {selection: []}], ['a bare selection', {selection: ['orbit_asc']}]]) {
        inOperation(`returns every pass's statistics in the order its model stores the passes, when asked for ${label}`, async () => {
            assert.deepEqual(await bands(historical(), args), [...passBands('desc'), ...passBands('asc')])
        })
    }
})

describe('a BAYTS Historical asked for output bands', () => {
    inOperation('returns exactly those, in the order asked', async () => {
        assert.deepEqual(await bands(historical(), withOutputBands({selection: ['VH_std_asc', 'orbit_desc']})), ['VH_std_asc', 'orbit_desc'])
    })

    inOperation('returns exactly those through a Masking', async () => {
        assert.deepEqual(await bands(MASKED, withOutputBands({selection: ['VH_std_asc', 'orbit_desc']})), ['VH_std_asc', 'orbit_desc'])
    })

    inOperation('refuses a band it does not build', async () => {
        await assert.rejects(bands(historical(), withOutputBands({selection: ['VV_mean_asc', 'nope']})), /'nope' did not match/)
    })
})

// Multitemporal speckle statistics come from each pass's own imagery, so a pass without any supplies none.
describe('a BAYTS Historical whose pass supplied no speckle statistics', () => {
    const filtered = historical({multitemporalSpeckleFilter: 'QUEGAN'})

    beforeEach(() => {
        speckleStatsByPass = {DESCENDING: true, ASCENDING: false}
    })

    inOperation('refuses its complete output', async () => {
        await assert.rejects(bands(filtered), /'VV_speckle_asc' did not match/)
    })

    inOperation('refuses a request naming those statistics', async () => {
        await assert.rejects(bands(filtered, withOutputBands({selection: ['VV_mean_asc', 'VH_speckle_asc']})), /'VH_speckle_asc' did not match/)
    })

    inOperation('returns a request that needs none of them', async () => {
        assert.deepEqual(await bands(filtered, withOutputBands({selection: ['VV_speckle_desc', 'VV_mean_asc']})), ['VV_speckle_desc', 'VV_mean_asc'])
    })
})
