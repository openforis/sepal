import {jest} from '@jest/globals'
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

        expect(bandEncoding).toEqual({red: REFLECTANCE, thermal: THERMAL, nbr: REFLECTANCE})
    })

    it('describes exactly the bands the export names, as its pyramiding policy does', async () => {
        const recipe = landsatMosaic()
        const pyramidingPolicy = {greenness: 'mean', nbr: 'mean', red: 'mean'}

        const exported = await submit({recipe, bands: ['greenness', 'nbr', 'red'], pyramidingPolicy})

        expect(exported.pyramidingPolicy).toEqual(pyramidingPolicy)
        expect(Object.keys(exported.bandEncoding).sort()).toEqual(Object.keys(pyramidingPolicy))
    })

    it('establishes the encoding from the recipe, whatever the submitted properties claim', async () => {
        const recipe = landsatMosaic()

        const {bandEncoding} = await submit({
            recipe,
            bands: ['red'],
            properties: {sepal_band_encoding: JSON.stringify({version: 1, bands: {red: THERMAL}})}
        })

        expect(bandEncoding).toEqual({red: REFLECTANCE})
    })

    it('leaves a band it does not declare an encoding for unknown', async () => {
        const recipe = landsatMosaic({compose: 'MEDOID'})

        const {bandEncoding} = await submit({recipe, bands: ['red', 'dayOfYear']})

        expect(bandEncoding).toEqual({red: REFLECTANCE})
    })

    it('reads no other recipe to describe its own output', async () => {
        const recipe = landsatMosaic()

        await submit({recipe, bands: ['red']})

        expect(state.recipeReads).toEqual([])
    })
})

describe('exporting a recipe that preserves its input', () => {
    it('records the encoding its input declares, read within this operation', async () => {
        const mosaic = landsatMosaic()
        const recipe = masking({primary: {type: 'RECIPE_REF', id: mosaic.id}})
        state.catalogue = {[mosaic.id]: mosaic}

        const {bandEncoding} = await submit({recipe, bands: ['nir', 'ndvi']})

        expect(bandEncoding).toEqual({nir: REFLECTANCE, ndvi: REFLECTANCE})
        expect(state.recipeReads).toEqual([mosaic.id])
    })

    // Naming no bands runs the producer's default image, which the available bands do not describe.
    it('records no encoding for an export that names no bands', async () => {
        const recipe = masking({primary: {type: 'ASSET', id: 'users/x/exported'}})
        state.assets['users/x/exported'] = {
            bands: [{name: 'red', arrayDimensions: 0}],
            properties: {sepal_band_encoding: JSON.stringify({version: 1, bands: {red: THERMAL}})}
        }

        const {bandEncoding} = await submit({recipe, bands: []})

        expect(bandEncoding).toEqual({})
    })

    it('records the encoding its input asset states', async () => {
        const recipe = masking({primary: {type: 'ASSET', id: 'users/x/exported'}})
        state.assets['users/x/exported'] = {
            bands: [{name: 'red', arrayDimensions: 0}],
            properties: {sepal_band_encoding: JSON.stringify({version: 1, bands: {red: THERMAL}})}
        }

        const {bandEncoding} = await submit({recipe, bands: ['red']})

        expect(bandEncoding).toEqual({red: THERMAL})
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

        expect(bandEncoding).toEqual({red: REFLECTANCE})
    })

    it('describes it the same way through a Masking over it', async () => {
        const source = filteredCollection()
        const recipe = masking({primary: {type: 'RECIPE_REF', id: source.id}})

        const {bandEncoding} = await submit({recipe, bands: ['red', 'nir']})

        expect(bandEncoding).toEqual({red: REFLECTANCE})
    })

    it('fails the export when the recipe\'s own image cannot be read', async () => {
        const source = filteredCollection()
        delete state.recipeImages[source.id]

        await expect(submit({recipe: source, bands: ['red']})).rejects.toThrow(/unavailable output/)
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

        expect(image).toEqual({builtFrom: 'masking-1'})
    })

    it('records no encoding, because CCDC states none', async () => {
        const recipe = maskedCcdc()

        const {bandEncoding} = await submit({recipe, bands: ['red_coefs', 'tStart']})

        expect(bandEncoding).toEqual({})
    })

    it('fails the export when the catalogue it declares cannot be read', async () => {
        const recipe = maskedCcdc()
        delete state.recipeBands['ccdc-1']

        await expect(submit({recipe, bands: ['tStart']})).rejects.toThrow(/unavailable output/)
    })
})

// Band Math is described from the output bands it is configured with, and the dimensionality its running image is
// observed to have - here, within the export itself - over inputs described as holding every band it includes.
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
    const DEM = {bands: [{name: 'elevation', arrayDimensions: 0}], properties: {}}

    beforeEach(() => {
        state.assets['users/x/dem'] = DEM
    })

    it('exports once its own running image is observed, recording that nothing is known about its values', async () => {
        const recipe = bandMath()
        state.recipeImages[recipe.id] = RUNNING_IMAGE

        const {bandEncoding, image} = await submit({recipe, bands: ['dem2', 'coefs']})

        expect(image).toMatchObject({builtFrom: recipe.id})
        expect(bandEncoding).toEqual({})
        expect(state.recipeReads).toEqual([])
    })

    it('fails the export when its running image cannot be observed', async () => {
        const recipe = bandMath()

        await expect(submit({recipe, bands: ['dem2']})).rejects.toThrow(/unavailable output/)
        expect(state.exported).toEqual([])
    })

    it('fails the export when its running image contradicts its configured output', async () => {
        const recipe = bandMath()
        state.recipeImages[recipe.id] = [{name: 'dem2', arrayDimensions: 0}, {name: 'coefs_1', arrayDimensions: 1}]

        await expect(submit({recipe, bands: ['dem2']})).rejects.toThrow(/invalid output \(CONFLICTING_OBSERVATION\)/)
        expect(state.exported).toEqual([])
    })

    it('fails the export for two output bands named alike, whatever its running image holds', async () => {
        const recipe = bandMath({outputNames: ['x', 'x']})
        state.recipeImages[recipe.id] = [{name: 'x', arrayDimensions: 0}, {name: 'x_1', arrayDimensions: 0}]

        await expect(submit({recipe, bands: ['x']})).rejects.toThrow(/invalid output \(DUPLICATE_BAND_NAME\)/)
        expect(state.exported).toEqual([])
    })

    // A refusal from the configuration alone is not delayed to read the inputs it would explain: its input here lacks the
    // band it includes, which only reading it would add.
    it('fails the export for two output bands named alike at once, reading none of its inputs', async () => {
        state.assets['users/x/dem'] = {bands: [{name: 'slope', arrayDimensions: 0}], properties: {}}
        const recipe = bandMath({outputNames: ['x', 'x']})

        await expect(submit({recipe, bands: ['x']})).rejects.toThrow(/invalid output \(DUPLICATE_BAND_NAME\)$/)
        expect(state.exported).toEqual([])
    })

    // Earth Engine cannot build an image of no bands; this used to be described as one, and fail only there.
    it('fails the export of a recipe outputting no bands, reading none of its inputs', async () => {
        state.assets['users/x/dem'] = {bands: [{name: 'slope', arrayDimensions: 0}], properties: {}}
        const recipe = bandMath({outputNames: []})

        await expect(submit({recipe, bands: []})).rejects.toThrow(/invalid output \(NO_OUTPUT_BANDS\)$/)
        expect(state.exported).toEqual([])
    })

    // Earth Engine refuses to build an image selecting a band its input lacks, so its running image is not observed.
    it('fails the export naming a band its input lacks, though its running image cannot be observed', async () => {
        state.assets['users/x/dem'] = {bands: [{name: 'slope', arrayDimensions: 0}], properties: {}}

        await expect(submit({recipe: bandMath(), bands: ['dem2']})).rejects.toThrow(/invalid output \(MISSING_INPUT_BAND\)/)
        expect(state.exported).toEqual([])
    })

    it('fails the export as unavailable, not as a missing band, when its input cannot be read', async () => {
        delete state.assets['users/x/dem']
        const recipe = bandMath()
        state.recipeImages[recipe.id] = RUNNING_IMAGE

        await expect(submit({recipe, bands: ['dem2']})).rejects.toThrow(/unavailable output/)
        expect(state.exported).toEqual([])
    })

    // An input is held to its whole description, including bands Band Math does not include.
    it('fails the export when its input asset reports no dimensionality for a band it does not include', async () => {
        state.assets['users/x/dem'] = {bands: [{name: 'elevation', arrayDimensions: 0}, {name: 'quality'}], properties: {}}
        const recipe = bandMath()
        state.recipeImages[recipe.id] = RUNNING_IMAGE

        await expect(submit({recipe, bands: ['dem2']})).rejects.toThrow(/invalid output \(INCOMPLETE_IMAGE_OUTPUT\)/)
        expect(state.exported).toEqual([])
    })

    // Earth Engine would build the inner recipe's outputs as `x` and `x_1`; it is refused, and with it what reads it.
    it('fails the export over a Band Math input naming two output bands alike', async () => {
        const inner = {...bandMath({outputNames: ['x', 'x']}), id: 'band-math-0'}
        state.catalogue = {[inner.id]: inner}
        state.recipeImages[inner.id] = [{name: 'x', arrayDimensions: 0}, {name: 'x_1', arrayDimensions: 0}]
        const recipe = {
            ...bandMath(),
            model: {
                ...bandMath().model,
                inputImagery: {images: [{imageId: 'i-1', name: 'i1', type: 'RECIPE_REF', id: inner.id, includedBands: [{id: 'b1', name: 'x'}]}]},
                outputBands: {outputImages: [{imageId: 'i-1', outputBands: [{id: 'b0', name: 'x', defaultOutputName: 'y'}]}]}
            }
        }
        state.recipeImages[recipe.id] = [{name: 'y', arrayDimensions: 0}]

        await expect(submit({recipe, bands: ['y']})).rejects.toThrow(/invalid output \(DUPLICATE_BAND_NAME\)/)
        expect(state.exported).toEqual([])
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

        expect(bandEncoding).toEqual({kndvi: REFLECTANCE})
        expect(state.recipeReads).toEqual([])
    })

    it('records histogram-matched Daily spectral bands stored per ten thousand too', async () => {
        const {bandEncoding} = await submit({recipe: planet({source: 'DAILY', histogramMatching: 'ENABLED'}), bands: ['red', 'ndvi']})

        expect(bandEncoding).toEqual({red: REFLECTANCE, ndvi: REFLECTANCE})
    })

    it('records the same through a Masking over it', async () => {
        const matched = planet({source: 'DAILY', histogramMatching: 'ENABLED'})
        state.catalogue = {[matched.id]: matched}

        const {bandEncoding} = await submit({recipe: masking({primary: {type: 'RECIPE_REF', id: matched.id}}), bands: ['nir', 'evi']})

        expect(bandEncoding).toEqual({nir: REFLECTANCE, evi: REFLECTANCE})
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

        expect(image).toEqual({builtFrom: 'historical-1'})
        expect(bandEncoding).toEqual({})
        expect(state.recipeReads).toEqual([])
    })

    it('fails the export for orbits that name no bands, before anything is exported', async () => {
        await expect(submit({recipe: historical(['ASCENDING', 'ASCENDING']), bands: ['VV_mean_asc']}))
            .rejects.toThrow(/invalid output \(DUPLICATE_BAND_NAME\)/)
        expect(state.exported).toEqual([])
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

        expect(image).toEqual({builtFrom: recipe.id})
        expect(bandEncoding).toEqual({})
        expect(state.recipeReads).toEqual([])
    })

    it('fails the export when the recipe its area of interest comes from cannot be read', async () => {
        const recipe = timeSeries({...configured, aoi: {type: 'RECIPE', id: 'unreadable'}})

        await expect(submit({recipe, bands: ['count']})).rejects.toThrow()
        expect(state.exported).toEqual([])
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

        expect(bandEncoding).toEqual({r: REFLECTANCE, heat: THERMAL})
    })

    // The input's record is read to complete the closure anyway; Earth Engine is asked nothing.
    it('fails the export for two output bands named alike, naming the input with no image output beside them', async () => {
        state.catalogue = {[DESIGN.id]: DESIGN}
        const recipe = stack(
            [{imageId: 'i-1', type: 'RECIPE_REF', id: DESIGN.id}, {imageId: 'i-2', type: 'RECIPE_REF', id: DESIGN.id}],
            [mapping('i-1', [['class', 'x']]), mapping('i-2', [['class', 'x']])]
        )

        await expect(submit({recipe, bands: ['x']})).rejects.toThrow(/invalid output \(NON_IMAGE_OUTPUT, DUPLICATE_BAND_NAME\)$/)
        expect(state.exported).toEqual([])
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
        await expect(submit({recipe: DESIGN, bands: ['class']})).rejects.toThrow(/recipe design-1: invalid output \(NON_IMAGE_OUTPUT\)/)
        expect(state.exported).toEqual([])
    })

    it('fails the export of a Masking over one', async () => {
        state.catalogue = {[DESIGN.id]: DESIGN}
        const recipe = masking({primary: {type: 'RECIPE_REF', id: DESIGN.id}})

        await expect(submit({recipe, bands: ['class']})).rejects.toThrow(/invalid output \(NON_IMAGE_OUTPUT\)/)
        expect(state.exported).toEqual([])
    })
})

describe('an output that cannot be described', () => {
    it('fails the export when a recipe it depends on cannot be read', async () => {
        const recipe = masking({primary: {type: 'RECIPE_REF', id: 'unreadable'}})

        await expect(submit({recipe, bands: ['red']})).rejects.toThrow()
        expect(state.exported).toEqual([])
    })

    // Missing evidence is never taken for a scalar: an asset reported without a band's dimensionality is not described.
    it('fails the export when an asset it reads does not report a band\'s dimensionality', async () => {
        state.assets['users/x/unreported'] = {bands: [{name: 'red', arrayDimensions: 0}, {name: 'nir'}], properties: {}}
        const recipe = masking({primary: {type: 'ASSET', id: 'users/x/unreported'}})

        await expect(submit({recipe, bands: ['red']})).rejects.toThrow(/invalid output \(INCOMPLETE_IMAGE_OUTPUT\)/)
        expect(state.exported).toEqual([])
    })

    it('fails the export when the evidence it depends on cannot be read', async () => {
        const recipe = masking({primary: {type: 'ASSET', id: 'users/x/unreachable'}})

        await expect(submit({recipe, bands: ['red']})).rejects.toThrow(/unavailable output/)
        expect(state.exported).toEqual([])
    })

    // A record its own type cannot read is a fault rather than a missing read, and it carries no diagnostic
    // of its own - so the failure has to name the cause it was given, or the export reports nothing usable.
    it('fails the export naming the fault when a record a provider reads is malformed', async () => {
        const malformed = {id: 'mosaic-1', type: 'MOSAIC'}
        const recipe = masking({primary: {type: 'RECIPE_REF', id: malformed.id}})
        state.catalogue = {[malformed.id]: malformed}

        const error = await submit({recipe, bands: ['red']}).then(() => null, error => error)

        expect(error.message).toMatch(new RegExp(`recipe ${recipe.id}: invalid output`))
        expect(error.message).toContain(error.cause.message)
        expect(state.exported).toEqual([])
    })
})

// Describing a recipe reads only the dependencies its providers need, and Masking's description never reads its
// mask. Whether the recipe may run is asked of every dependency, before anything is described.
describe('a recipe whose dependencies are not structurally sound', () => {
    const selfMask = {type: 'RECIPE_REF', id: 'masking-1'}

    it('fails the export naming the cycle, though its output could be described', async () => {
        state.catalogue = {'mosaic-1': landsatMosaic()}
        const recipe = masking({primary: {type: 'RECIPE_REF', id: 'mosaic-1'}, mask: selfMask})

        await expect(submit({recipe, bands: ['red']})).rejects.toThrow(/cannot run.*CYCLIC_DEPENDENCY/)
        expect(state.exported).toEqual([])
    })

    it('fails with the unreadable dependency as the cause, naming the cycle already found', async () => {
        const recipe = masking({primary: {type: 'RECIPE_REF', id: 'unreadable'}, mask: selfMask})

        const error = await submit({recipe, bands: ['red']}).then(() => null, error => error)

        expect(error.message).toMatch(/CYCLIC_DEPENDENCY/)
        expect(error.cause.message).toBe('Recipe could not be read: unreadable')
        expect(state.exported).toEqual([])
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
    const {submit$} = await import('./imageAssetExport.js')
    await lastValueFrom(submit$('task-1', {
        image: {
            recipe,
            bands: {selection: bands},
            scale: 30,
            properties,
            assetId: 'projects/p/assets/out',
            ...(pyramidingPolicy && {pyramidingPolicy})
        }
    }))
    expect(state.exported).toHaveLength(1)
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

jest.unstable_mockModule('#sepal/ee/ee', () => ({
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
}))
jest.unstable_mockModule('#sepal/ee/recipe', () => ({
    loadRecipe$: id => {
        state.recipeReads.push(id)
        return state.catalogue[id]
            ? of(state.catalogue[id])
            : throwError(() => new Error(`Recipe could not be read: ${id}`))
    }
}))
jest.unstable_mockModule('#sepal/ee/imageFactory', () => ({
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
}))
jest.unstable_mockModule('./workloadTag.js', () => ({setWorkloadTag: () => {}}))
jest.unstable_mockModule('../jobs/export/toAsset.js', () => ({
    exportImageToAsset$: (_taskId, args) => {
        state.exported.push(args)
        return of(true)
    }
}))

beforeEach(() => {
    state.catalogue = {}
    state.assets = {}
    state.recipeImages = {}
    state.recipeBands = {}
    state.recipeReads = []
    state.exported = []
})
