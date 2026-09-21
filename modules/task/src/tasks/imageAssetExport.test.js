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

describe('exporting a recipe type that declares no output', () => {
    it('exports as before, stating that nothing is known about its values', async () => {
        const recipe = {id: 'radar-1', type: 'RADAR_MOSAIC', model: {}}

        const {bandEncoding, image} = await submit({recipe, bands: ['VV']})

        expect(image).toEqual({builtFrom: recipe.id})
        expect(bandEncoding).toEqual({})
        expect(state.recipeReads).toEqual([])
    })

    it('exports a recipe preserving such a type as unknown rather than failing', async () => {
        const radar = {id: 'radar-1', type: 'RADAR_MOSAIC', model: {}}
        const recipe = masking({primary: {type: 'RECIPE_REF', id: radar.id}})
        state.catalogue = {[radar.id]: radar}

        const {bandEncoding} = await submit({recipe, bands: ['VV']})

        expect(bandEncoding).toEqual({})
    })
})

describe('an output that cannot be described', () => {
    it('fails the export when a recipe it depends on cannot be read', async () => {
        const recipe = masking({primary: {type: 'RECIPE_REF', id: 'unreadable'}})

        await expect(submit({recipe, bands: ['red']})).rejects.toThrow()
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

const landsatMosaic = ({compose = 'MEDIAN'} = {}) => ({
    id: 'mosaic-1',
    type: 'MOSAIC',
    model: {
        sources: {dataSets: {LANDSAT: ['LANDSAT_8']}, cloudPercentageThreshold: 100},
        compositeOptions: {corrections: ['SR'], compose}
    }
})

const masking = ({primary}) => ({
    id: 'masking-1',
    type: 'MASKING',
    model: {imageToMask: primary, imageMask: {type: 'ASSET', id: 'users/x/mask'}}
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

jest.unstable_mockModule('#sepal/ee/ee', () => ({
    default: {
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
            getImage$: () => state.assets[source.id]
                ? of(assetImage(state.assets[source.id]))
                : throwError(() => new Error(`Asset could not be read: ${source.id}`))
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
