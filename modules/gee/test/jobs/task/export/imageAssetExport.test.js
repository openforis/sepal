import assert from 'node:assert/strict'
import {beforeEach, describe, it, mock} from 'node:test'

import {lastValueFrom, of, throwError} from 'rxjs'

// Recipe reads, image construction, Earth Engine evaluation and the exporter are substituted. Resolution,
// declarations and the band evidence expressions are the real ones. What the export establishes is the facts it
// hands the exporter; how those are stored as metadata belongs to the exporter and is covered with it.

const REFLECTANCE = {scale: 0.0001, offset: 0, unit: '1'}
const THERMAL = {scale: 0.1, offset: 0, unit: 'K'}

describe('exporting an optical mosaic', () => {
    it('records the encoding of each selected band, including a generated index', async () => {
        const recipe = landsatMosaic()

        const {bandEncoding} = await submit({recipe, bands: ['red', 'thermal', 'nbr']})

        assert.deepEqual(bandEncoding, {red: REFLECTANCE, thermal: THERMAL, nbr: REFLECTANCE})
    })

    it('describes exactly the bands the export names, as its pyramiding policy does', async () => {
        const recipe = landsatMosaic()
        const pyramidingPolicy = {greenness: 'mean', nbr: 'mean', red: 'mean'}

        const exported = await submit({recipe, bands: ['greenness', 'nbr', 'red'], pyramidingPolicy})

        assert.deepEqual(exported.pyramidingPolicy, pyramidingPolicy)
        assert.deepEqual(Object.keys(exported.bandEncoding).sort(), Object.keys(pyramidingPolicy))
    })

    it('establishes the encoding from the recipe, whatever the submitted properties claim', async () => {
        const recipe = landsatMosaic()

        const {bandEncoding} = await submit({
            recipe,
            bands: ['red'],
            properties: {sepal_band_encoding: JSON.stringify({version: 1, bands: {red: THERMAL}})}
        })

        assert.deepEqual(bandEncoding, {red: REFLECTANCE})
    })

    it('leaves a band it does not declare an encoding for unknown', async () => {
        const recipe = landsatMosaic({compose: 'MEDOID'})

        const {bandEncoding} = await submit({recipe, bands: ['red', 'dayOfYear']})

        assert.deepEqual(bandEncoding, {red: REFLECTANCE})
    })

    it('reads no other recipe to describe its own output', async () => {
        const recipe = landsatMosaic()

        await submit({recipe, bands: ['red']})

        assert.deepEqual(state.recipeReads, [])
    })
})

describe('exporting a recipe that preserves its input', () => {
    it('records the encoding its input declares, read within this operation', async () => {
        const mosaic = landsatMosaic()
        const recipe = masking({primary: {type: 'RECIPE_REF', id: mosaic.id}})
        state.catalogue = {[mosaic.id]: mosaic}

        const {bandEncoding} = await submit({recipe, bands: ['nir', 'ndvi']})

        assert.deepEqual(bandEncoding, {nir: REFLECTANCE, ndvi: REFLECTANCE})
        assert.deepEqual(state.recipeReads, [mosaic.id])
    })

    // Naming no bands runs the producer's default image, which the available bands do not describe.
    it('records no encoding for an export that names no bands', async () => {
        const recipe = masking({primary: {type: 'ASSET', id: 'users/x/exported'}})
        state.assets['users/x/exported'] = {
            bands: [{name: 'red', arrayDimensions: 0}],
            properties: {sepal_band_encoding: JSON.stringify({version: 1, bands: {red: THERMAL}})}
        }

        const {bandEncoding} = await submit({recipe, bands: []})

        assert.deepEqual(bandEncoding, {})
    })

    it('records the encoding its input asset states', async () => {
        const recipe = masking({primary: {type: 'ASSET', id: 'users/x/exported'}})
        state.assets['users/x/exported'] = {
            bands: [{name: 'red', arrayDimensions: 0}],
            properties: {sepal_band_encoding: JSON.stringify({version: 1, bands: {red: THERMAL}})}
        }

        const {bandEncoding} = await submit({recipe, bands: ['red']})

        assert.deepEqual(bandEncoding, {red: THERMAL})
    })
})

// A collection asset is read as its first image, while an Asset recipe filters before compositing. What these
// establish is which bands an encoding is recorded for. They do not establish that the export would succeed:
// the selection deliberately names a band the configured image does not hold, which Earth Engine would refuse.
describe('encoding recorded for a recipe over a filtered collection asset', () => {
    const assetRecipe = () => ({
        id: 'asset-1',
        type: 'ASSET_MOSAIC',
        model: {
            assetDetails: {assetId: 'users/x/collection', type: 'ImageCollection'},
            dates: {type: 'DATE_RANGE', fromDate: '2021-01-01', toDate: '2022-01-01'},
            composite: {type: 'MOSAIC'}
        }
    })

    // Reading the collection shows its first image, with two bands and an encoding for each; the recipe filters
    // to images that hold only one of them.
    const filteredCollection = () => {
        const source = assetRecipe()
        state.catalogue = {[source.id]: source}
        state.assets['users/x/collection'] = {
            type: 'ImageCollection',
            bands: [{name: 'red', arrayDimensions: 0}, {name: 'nir', arrayDimensions: 0}],
            properties: {
                sepal_band_encoding: JSON.stringify({version: 1, bands: {red: REFLECTANCE, nir: REFLECTANCE}})
            }
        }
        state.recipeImages[source.id] = [{name: 'red', arrayDimensions: 0}]
        return source
    }

    it('records no encoding for a band its filtering leaves out of the image it builds, whatever is selected', async () => {
        const source = filteredCollection()

        const {bandEncoding} = await submit({recipe: source, bands: ['red', 'nir']})

        assert.deepEqual(bandEncoding, {red: REFLECTANCE})
    })

    it('describes it the same way through a Masking over it', async () => {
        const source = filteredCollection()
        const recipe = masking({primary: {type: 'RECIPE_REF', id: source.id}})

        const {bandEncoding} = await submit({recipe, bands: ['red', 'nir']})

        assert.deepEqual(bandEncoding, {red: REFLECTANCE})
    })

    it('fails the export when the recipe\'s own image cannot be read', async () => {
        const source = filteredCollection()
        delete state.recipeImages[source.id]

        await assert.rejects(submit({recipe: source, bands: ['red']}), /unavailable output/)
    })
})

// CCDC fits only the measures it is asked for, so the image it builds for this export is not its catalogue.
// Its own image is deliberately unreadable here: a description taken from that image could not be had.
describe('exporting a masked CCDC', () => {
    const maskedCcdc = () => {
        const ccdc = {
            id: 'ccdc-1',
            type: 'CCDC',
            model: {sources: {dataSets: {LANDSAT: ['LANDSAT_8']}, breakpointBands: ['ndvi']}}
        }
        state.catalogue = {[ccdc.id]: ccdc}
        state.recipeBands[ccdc.id] = ['tStart', 'red_coefs', 'ndvi_coefs']
        return masking({primary: {type: 'RECIPE_REF', id: ccdc.id}})
    }

    it('describes it from the bands it says it can be asked for, not from the image it builds', async () => {
        const recipe = maskedCcdc()

        const {image} = await submit({recipe, bands: ['red_coefs', 'tStart']})

        assert.deepEqual(image, {builtFrom: 'masking-1'})
    })

    it('records no encoding, because CCDC states none', async () => {
        const recipe = maskedCcdc()

        const {bandEncoding} = await submit({recipe, bands: ['red_coefs', 'tStart']})

        assert.deepEqual(bandEncoding, {})
    })

    it('fails the export when the catalogue it declares cannot be read', async () => {
        const recipe = maskedCcdc()
        delete state.recipeBands['ccdc-1']

        await assert.rejects(submit({recipe, bands: ['tStart']}), /unavailable output/)
    })
})

// Band Math is described from the output bands it is configured with, and the dimensionality its running image is
// observed to have - here, within the export itself.
describe('exporting a Band Math recipe', () => {
    const bandMath = ({outputNames = ['dem2', 'coefs']} = {}) => ({
        id: 'band-math-1',
        type: 'BAND_MATH',
        model: {
            inputImagery: {images: [{imageId: 'i-1', name: 'i1', type: 'ASSET', id: 'users/x/dem', includedBands: [{id: 'b1', name: 'elevation'}]}]},
            calculations: {calculations: []},
            outputBands: {outputImages: [{imageId: 'i-1', outputBands: outputNames.map((name, index) => ({id: `b${index}`, name: 'elevation', defaultOutputName: name}))}]}
        }
    })
    const RUNNING_IMAGE = [{name: 'dem2', arrayDimensions: 0}, {name: 'coefs', arrayDimensions: 1}]

    it('exports once its own running image is observed, recording that nothing is known about its values', async () => {
        const recipe = bandMath()
        state.recipeImages[recipe.id] = RUNNING_IMAGE

        const {bandEncoding, image} = await submit({recipe, bands: ['dem2', 'coefs']})

        assert.partialDeepStrictEqual(image, {builtFrom: recipe.id})
        assert.deepEqual(bandEncoding, {})
        assert.deepEqual(state.recipeReads, [])
    })

    it('fails the export when its running image cannot be observed', async () => {
        const recipe = bandMath()

        await assert.rejects(submit({recipe, bands: ['dem2']}), /unavailable output/)
        assert.deepEqual(state.exported, [])
    })

    it('fails the export when its running image contradicts its configured output', async () => {
        const recipe = bandMath()
        state.recipeImages[recipe.id] = [{name: 'dem2', arrayDimensions: 0}, {name: 'coefs_1', arrayDimensions: 1}]

        await assert.rejects(
            submit({recipe, bands: ['dem2']}),
            /invalid output \(CONFLICTING_OBSERVATION\)/
        )
        assert.deepEqual(state.exported, [])
    })

    it('fails the export for two output bands named alike, whatever its running image holds', async () => {
        const recipe = bandMath({outputNames: ['x', 'x']})
        state.recipeImages[recipe.id] = [{name: 'x', arrayDimensions: 0}, {name: 'x_1', arrayDimensions: 0}]

        await assert.rejects(submit({recipe, bands: ['x']}), /invalid output \(DUPLICATE_BAND_NAME\)/)
        assert.deepEqual(state.exported, [])
    })
})

describe('exporting a Planet Mosaic', () => {
    const planet = ({source = 'BASEMAPS', histogramMatching = 'DISABLED'} = {}) => ({
        id: 'planet-1',
        type: 'PLANET_MOSAIC',
        model: {
            aoi: {type: 'POLYGON', path: [[0, 0], [0, 1], [1, 1]]},
            dates: {fromDate: '2024-01-01', toDate: '2024-04-01'},
            sources: {source, assets: ['users/x/planet']},
            options: {histogramMatching}
        }
    })

    it('records its indexes stored per ten thousand, and leaves its spectral bands\' scaling unknown', async () => {
        const {bandEncoding} = await submit({recipe: planet(), bands: ['red', 'kndvi']})

        assert.deepEqual(bandEncoding, {kndvi: REFLECTANCE})
        assert.deepEqual(state.recipeReads, [])
    })

    it('records histogram-matched Daily spectral bands stored per ten thousand too', async () => {
        const {bandEncoding} = await submit({recipe: planet({source: 'DAILY', histogramMatching: 'ENABLED'}), bands: ['red', 'ndvi']})

        assert.deepEqual(bandEncoding, {red: REFLECTANCE, ndvi: REFLECTANCE})
    })

    it('records the same through a Masking over it', async () => {
        const matched = planet({source: 'DAILY', histogramMatching: 'ENABLED'})
        state.catalogue = {[matched.id]: matched}

        const {bandEncoding} = await submit({recipe: masking({primary: {type: 'RECIPE_REF', id: matched.id}}), bands: ['nir', 'evi']})

        assert.deepEqual(bandEncoding, {nir: REFLECTANCE, evi: REFLECTANCE})
    })
})

describe('exporting a BAYTS Historical', () => {
    const historical = orbits => ({
        id: 'historical-1',
        type: 'BAYTS_HISTORICAL',
        model: {aoi: {type: 'POLYGON', path: [[0, 0], [0, 1], [1, 1]]}, dates: {}, options: {orbits}}
    })

    it('records that nothing is known about its values, reading no other recipe', async () => {
        const {bandEncoding, image} = await submit({recipe: historical(['ASCENDING']), bands: ['VV_mean_asc', 'orbit_asc']})

        assert.deepEqual(image, {builtFrom: 'historical-1'})
        assert.deepEqual(bandEncoding, {})
        assert.deepEqual(state.recipeReads, [])
    })

    it('fails the export for orbits that name no bands, before anything is exported', async () => {
        await assert.rejects(
            submit({recipe: historical(['ASCENDING', 'ASCENDING']), bands: ['VV_mean_asc']}),
            /invalid output \(DUPLICATE_BAND_NAME\)/
        )
        assert.deepEqual(state.exported, [])
    })
})

describe('exporting a Time Series', () => {
    const timeSeries = model => ({id: 'time-series-1', type: 'TIME_SERIES', model})
    const configured = {
        aoi: {type: 'POLYGON', path: [[0, 0], [0, 1], [1, 1]]},
        dates: {startDate: '2023-01-01', endDate: '2024-01-01'},
        sources: {dataSets: {LANDSAT: ['LANDSAT_8']}},
        options: {corrections: []}
    }

    it('records that nothing is known about its count, reading no other recipe', async () => {
        const recipe = timeSeries(configured)

        const {bandEncoding, image} = await submit({recipe, bands: ['count']})

        assert.deepEqual(image, {builtFrom: recipe.id})
        assert.deepEqual(bandEncoding, {})
        assert.deepEqual(state.recipeReads, [])
    })

    it('fails the export when the recipe its area of interest comes from cannot be read', async () => {
        const recipe = timeSeries({...configured, aoi: {type: 'RECIPE', id: 'unreadable'}})

        await assert.rejects(submit({recipe, bands: ['count']}))
        assert.deepEqual(state.exported, [])
    })
})

// A Stack's bands are its inputs' bands under the names its mapping gives them, so what is recorded for a band is keyed
// by that name.
describe('exporting a Stack', () => {
    const stack = (images, bandNames) => ({id: 'stack-1', type: 'STACK', model: {inputImagery: {images}, bandNames: {bandNames}}})
    const mapping = (imageId, pairs) => ({
        imageId,
        bands: pairs.map(([originalName, outputName], index) => ({id: `${imageId}-${index}`, originalName, outputName}))
    })
    const DESIGN = {id: 'design-1', type: 'SAMPLING_DESIGN', model: {aoi: {type: 'POLYGON', path: [[0, 0], [0, 1], [1, 1], [0, 0]]}}}

    it('records each band\'s encoding under the name it is renamed to', async () => {
        const mosaic = landsatMosaic()
        state.catalogue = {[mosaic.id]: mosaic}
        const recipe = stack(
            [{imageId: 'i-1', type: 'RECIPE_REF', id: mosaic.id}],
            [mapping('i-1', [['red', 'r'], ['thermal', 'heat']])]
        )

        const {bandEncoding} = await submit({recipe, bands: ['r', 'heat']})

        assert.deepEqual(bandEncoding, {r: REFLECTANCE, heat: THERMAL})
    })

    it('fails the export for two output bands named alike, before reading an input with no image output', async () => {
        state.catalogue = {[DESIGN.id]: DESIGN}
        const recipe = stack(
            [{imageId: 'i-1', type: 'RECIPE_REF', id: DESIGN.id}, {imageId: 'i-2', type: 'RECIPE_REF', id: DESIGN.id}],
            [mapping('i-1', [['class', 'x']]), mapping('i-2', [['class', 'x']])]
        )

        await assert.rejects(submit({recipe, bands: ['x']}), /invalid output \(DUPLICATE_BAND_NAME\)/)
        assert.deepEqual(state.exported, [])
    })
})

// A Sampling Design draws samples, which its own tasks export as a table. Read as an image it has none, so an image
// export of it, or of a recipe over it, fails before anything is built.
describe('exporting a recipe that produces no image', () => {
    const DESIGN = {
        id: 'design-1',
        type: 'SAMPLING_DESIGN',
        model: {aoi: {type: 'POLYGON', path: [[0, 0], [0, 1], [1, 1], [0, 0]]}}
    }

    it('fails the export, naming the design as having no image output', async () => {
        await assert.rejects(
            submit({recipe: DESIGN, bands: ['class']}),
            /recipe design-1: invalid output \(NON_IMAGE_OUTPUT\)/
        )
        assert.deepEqual(state.exported, [])
    })

    it('fails the export of a Masking over one', async () => {
        state.catalogue = {[DESIGN.id]: DESIGN}
        const recipe = masking({primary: {type: 'RECIPE_REF', id: DESIGN.id}})

        await assert.rejects(submit({recipe, bands: ['class']}), /invalid output \(NON_IMAGE_OUTPUT\)/)
        assert.deepEqual(state.exported, [])
    })
})

describe('an output that cannot be described', () => {
    it('fails the export when a recipe it depends on cannot be read', async () => {
        const recipe = masking({primary: {type: 'RECIPE_REF', id: 'unreadable'}})

        await assert.rejects(submit({recipe, bands: ['red']}))
        assert.deepEqual(state.exported, [])
    })

    // Missing evidence is never taken for a scalar: an asset reported without a band's dimensionality is not described.
    it('fails the export when an asset it reads does not report a band\'s dimensionality', async () => {
        state.assets['users/x/unreported'] = {bands: [{name: 'red', arrayDimensions: 0}, {name: 'nir'}], properties: {}}
        const recipe = masking({primary: {type: 'ASSET', id: 'users/x/unreported'}})

        await assert.rejects(
            submit({recipe, bands: ['red']}),
            /invalid output \(INCOMPLETE_IMAGE_OUTPUT\)/
        )
        assert.deepEqual(state.exported, [])
    })

    it('fails the export when the evidence it depends on cannot be read', async () => {
        const recipe = masking({primary: {type: 'ASSET', id: 'users/x/unreachable'}})

        await assert.rejects(submit({recipe, bands: ['red']}), /unavailable output/)
        assert.deepEqual(state.exported, [])
    })

    // A record its own type cannot read is a fault rather than a missing read, and it carries no diagnostic
    // of its own - so the failure has to name the cause it was given, or the export reports nothing usable.
    it('fails the export naming the fault when a record a provider reads is malformed', async () => {
        const malformed = {id: 'mosaic-1', type: 'MOSAIC'}
        const recipe = masking({primary: {type: 'RECIPE_REF', id: malformed.id}})
        state.catalogue = {[malformed.id]: malformed}

        const error = await submit({recipe, bands: ['red']}).then(() => null, error => error)

        assert.match(error.message, new RegExp(`recipe ${recipe.id}: invalid output`))
        assert.ok(error.message.includes(error.cause.message))
        assert.deepEqual(state.exported, [])
    })
})

// Describing a recipe reads only the dependencies its providers need, and Masking's description never reads its
// mask. Whether the recipe may run is asked of every dependency, before anything is described.
describe('a recipe whose dependencies are not structurally sound', () => {
    const selfMask = {type: 'RECIPE_REF', id: 'masking-1'}

    it('fails the export naming the cycle, though its output could be described', async () => {
        state.catalogue = {'mosaic-1': landsatMosaic()}
        const recipe = masking({primary: {type: 'RECIPE_REF', id: 'mosaic-1'}, mask: selfMask})

        await assert.rejects(submit({recipe, bands: ['red']}), /cannot run.*CYCLIC_DEPENDENCY/)
        assert.deepEqual(state.exported, [])
    })

    it('fails with the unreadable dependency as the cause, naming the cycle already found', async () => {
        const recipe = masking({primary: {type: 'RECIPE_REF', id: 'unreadable'}, mask: selfMask})

        const error = await submit({recipe, bands: ['red']}).then(() => null, error => error)

        assert.match(error.message, /CYCLIC_DEPENDENCY/)
        assert.equal(error.cause.message, 'Recipe could not be read: unreadable')
        assert.deepEqual(state.exported, [])
    })
})

const landsatMosaic = ({compose = 'MEDIAN'} = {}) => ({
    id: 'mosaic-1',
    type: 'MOSAIC',
    model: {
        sources: {dataSets: {LANDSAT: ['LANDSAT_8']}, cloudPercentageThreshold: 100},
        compositeOptions: {corrections: ['SR'], compose}
    }
})

const masking = ({primary, mask = {type: 'ASSET', id: 'users/x/mask'}}) => ({
    id: 'masking-1',
    type: 'MASKING',
    model: {imageToMask: primary, imageMask: mask}
})

const state = {}

const submit = async ({recipe, bands, pyramidingPolicy, properties = {}}) => {
    const {startImageAssetExport$} = await import('#gee/jobs/task/export/imageAssetExport')
    await lastValueFrom(startImageAssetExport$({
        image: {
            recipe,
            bands: {selection: bands},
            scale: 30,
            properties,
            assetId: 'projects/p/assets/out',
            ...(pyramidingPolicy && {pyramidingPolicy})
        }
    }))
    assert.equal(state.exported.length, 1)
    return state.exported[0]
}

// A recipe image answers for its bands only where a scenario says what it builds; a recipe nothing observes
// stays the bare image the other cases assert on.
const recipeImage = id => state.recipeImages[id]
    ? {builtFrom: id, ...assetImage({bands: state.recipeImages[id], properties: {}})}
    : {builtFrom: id}

const assetImage = ({bands, properties}) => ({
    bandNames: () => ({map: mapper => bands.map(({name}) => mapper(name))}),
    bandTypes: () => ({get: name => bands.find(band => band.name === name)}),
    toDictionary: keys => Object.fromEntries(keys.filter(key => key in properties).map(key => [key, properties[key]]))
})

// An asset is read directly: an image, or a collection's first image with the collection's own properties. A
// collection refuses to be mosaicked, which is a read of every member.
const collection = ({bands, properties}) => ({
    merge: () => ({first: () => assetImage({bands, properties: {}})}),
    limit: () => ({size: () => 1}),
    toDictionary: assetImage({bands: [], properties}).toDictionary,
    mosaic: () => {
        throw new Error('mosaicked the whole collection')
    }
})

mock.module('#sepal/ee/ee', {
    exports: {
        default: {
            getAsset$: id => state.assets[id]
                ? of({type: state.assets[id].type || 'Image'})
                : throwError(() => new Error(`Asset could not be read: ${id}`)),
            Image: id => assetImage(typeof id === 'string' ? state.assets[id] : {bands: [], properties: {}}),
            ImageCollection: id => collection(typeof id === 'string' ? state.assets[id] : {bands: [], properties: {}}),
            Dictionary: values => values,
            PixelType: band => ({dimensions: () => band.arrayDimensions}),
            getInfo$: value => of(value)
        }
    }
})
mock.module('#sepal/ee/recipe', {
    exports: {
        loadRecipe$: id => {
            state.recipeReads.push(id)
            return state.catalogue[id]
                ? of(state.catalogue[id])
                : throwError(() => new Error(`Recipe could not be read: ${id}`))
        }
    }
})
mock.module('#sepal/ee/imageFactory', {
    exports: {
        default: source => source.type === 'ASSET'
            ? {
                getImage$: () => throwError(() => new Error(`Read an asset through the image execution builds: ${source.id}`))
            }
            : {
                getImage$: () => of(recipeImage(source.id)),
                getBands$: () => state.recipeBands[source.id]
                    ? of(state.recipeBands[source.id])
                    : throwError(() => new Error(`Recipe bands could not be read: ${source.id}`)),
                getGeometry$: () => of({bounds: () => 'region'})
            }
    }
})
mock.module('#gee/jobs/task/export/toAsset', {
    exports: {
        startImageToAssetExport$: args => {
            state.exported.push(args)
            return of({eeTaskId: 'T1', assetId: args.assetId})
        }
    }
})

beforeEach(() => {
    state.catalogue = {}
    state.assets = {}
    state.recipeImages = {}
    state.recipeBands = {}
    state.recipeReads = []
    state.exported = []
})
