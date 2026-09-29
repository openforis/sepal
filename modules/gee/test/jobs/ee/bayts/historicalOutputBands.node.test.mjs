import assert from 'node:assert/strict'
import {beforeEach, describe, it, mock} from 'node:test'

import {firstValueFrom, of, throwError} from 'rxjs'

// Which bands a BAYTS Historical returns, directly and through a Masking, and what each pass is built from, through
// the REAL imageFactory, recipeRef, masking, asset and BAYTS Historical implementations. The radar mosaic each pass is
// built from, whether a pass has scenes, recipe reads and Earth Engine are substituted: an image here is its band
// names, a pass's radar mosaic holds the statistics it was asked for, and a refused image fails when its bands are
// read. Pixels and masks - a pass without scenes masked, each pass holding its own imagery's statistics - are the
// live verifier's (verify/baytsHistoricalOutputBands.mjs).
//
// Run by Node's own test runner rather than Jest, because imageFactory loads every implementation through
// createRequire. Launched from a Jest bridge so it still runs in the ordinary gee gate.

let catalogue = {}
let scenes = {}
let radarMosaics = []

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
    geometry: () => ({})
})

// An image Earth Engine refuses when evaluated, for the error it was built from.
const refusedImage = error => ({
    get bands() {
        throw new Error(error)
    }
})

mock.module('#sepal/ee/ee', {
    exports: {
        default: {
            getAsset$: () => of({type: 'Image'}),
            Image: Object.assign(
                value => Array.isArray(value)
                    ? eeImage(value.flatMap(image => image.bands))
                    : typeof value === 'string'
                        ? value.startsWith('[error: ') ? refusedImage(value) : eeImage(['mask'])
                        : typeof value === 'object' ? value : eeImage(['constant']),
                {
                    cat: (...images) => eeImage(images.flatMap(image => image.bands)),
                    constant: values => eeImage(values.map((_value, i) => `constant_${i}`))
                }
            ),
            Geometry: Object.assign(() => ({}), {Polygon: () => ({})}),
            Algorithms: {If: (condition, whenTrue, whenFalse) => condition ? whenTrue : whenFalse},
            List: values => ({reduce: reducer => reducer(values)}),
            Reducer: {anyNonZero: () => values => values.some(Boolean)}
        }
    }
})

mock.module('#sepal/ee/radar/mosaic', {
    defaultExport: (recipe, {selection}) => {
        radarMosaics.push(recipe)
        return {getImage$: () => of(eeImage(selection))}
    }
})

mock.module('#sepal/ee/radar/collection', {
    namedExports: {
        hasImagery: ({orbits: [orbitPass]}) => scenes[orbitPass],
        createCollection: () => assert.fail('No radar collection is built here')
    }
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

const historical = ({orbits = ['DESCENDING', 'ASCENDING']} = {}) => ({
    id: 'historical-1',
    type: 'BAYTS_HISTORICAL',
    model: {
        aoi: {type: 'POLYGON', path: [[0, 0], [0, 1], [1, 1]]},
        dates: {fromDate: '2023-01-01', toDate: '2024-01-01'},
        options: {orbits, orbitNumbers: 'DOMINANT', spatialSpeckleFilter: 'LEE', multitemporalSpeckleFilter: 'NONE'}
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
    scenes = {DESCENDING: true, ASCENDING: true}
    radarMosaics = []
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

describe('a BAYTS Historical of both passes', () => {
    inOperation('builds each pass from the recipe with that pass alone as its orbits', async () => {
        const recipe = historical()

        await bands(recipe)

        assert.deepEqual(radarMosaics, ['DESCENDING', 'ASCENDING'].map(orbitPass => ({
            ...recipe,
            type: 'RADAR_MOSAIC',
            model: {...recipe.model, options: {...recipe.model.options, orbits: [orbitPass]}}
        })))
    })
})

describe('a BAYTS Historical with a pass without scenes', () => {
    beforeEach(() => {
        scenes = {DESCENDING: true, ASCENDING: false}
    })

    inOperation('returns every pass\'s statistics', async () => {
        assert.deepEqual(await bands(historical()), [...passBands('desc'), ...passBands('asc')])
    })

    inOperation('returns the pass with scenes alone, when asked for it', async () => {
        const request = [...passBands('desc')].reverse()
        assert.deepEqual(await bands(historical(), withOutputBands({selection: request})), request)
    })

    inOperation('returns the pass without scenes alone, when asked for it', async () => {
        const request = [...passBands('asc')].reverse()
        assert.deepEqual(await bands(historical(), withOutputBands({selection: request})), request)
    })
})

describe('a BAYTS Historical with no pass with scenes', () => {
    beforeEach(() => {
        scenes = {DESCENDING: false, ASCENDING: false}
    })

    inOperation('refuses its complete output as having no images', async () => {
        await assert.rejects(bands(historical()), /All images have been filtered out/)
    })

    inOperation('refuses a pass asked for as having no images', async () => {
        await assert.rejects(bands(historical(), withOutputBands({selection: passBands('desc')})), /All images have been filtered out/)
    })
})
