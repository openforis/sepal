import assert from 'node:assert/strict'
import {beforeEach, describe, it, mock} from 'node:test'
import {format} from 'node:util'

import {lastValueFrom, of, throwError} from 'rxjs'

import {assertMatches} from '#sepal/testSupport/assert'

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

    for (const [_case, fields] of [
        ['expression', {type: 'EXPRESSION', expression: 'gone.elevation * 2'}],
        ['reducer', {type: 'FUNCTION', reducer: 'mean', usedBands: [{imageId: 'gone', imageName: 'gone', name: 'elevation'}]}],
        ['unselected band', {type: 'EXPRESSION', expression: 'i1.nir'}]
    ]) {
        it(format('refuses broken %s references here and downstream, then exports after repair', _case), async () => {
            const recipe = bandMath()
            recipe.model.calculations.calculations = [{imageId: 'calc', name: 'c1', includedBands: [{name: 'result'}], ...fields}]
            const over = {id: 'over-math', type: 'REMAPPING', model: {
                inputImagery: {images: [{imageId: 'math', type: 'RECIPE_REF', id: recipe.id, includedBands: [{band: 'dem2'}]}]},
                legend: {entries: [{value: 1}]}
            }}
            state.catalogue = {[recipe.id]: recipe}
            state.recipeImages[recipe.id] = RUNNING_IMAGE
            await assert.rejects(submit({recipe, bands: ['dem2']}), /cannot run: INVALID_CALCULATION$/)
            await assert.rejects(submit({recipe: over, bands: ['class']}), /cannot run: INVALID_CALCULATION$/)
            assert.deepEqual(state.exported, [])

            recipe.model.calculations.calculations[0] = {imageId: 'calc', name: 'c1', type: 'EXPRESSION', expression: 'i1.elevation * 2', includedBands: [{name: 'result'}]}
            assert.equal((await submit({recipe, bands: ['dem2']})).image.builtFrom, recipe.id)
            state.exported = []
            assert.equal((await submit({recipe: over, bands: ['class']})).image.builtFrom, over.id)
        })
    }

    it('exports once its own running image is observed, recording that nothing is known about its values', async () => {
        const recipe = bandMath()
        state.recipeImages[recipe.id] = RUNNING_IMAGE

        const {bandEncoding, image} = await submit({recipe, bands: ['dem2', 'coefs']})

        assertMatches(image, {builtFrom: recipe.id})
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

        await assert.rejects(submit({recipe, bands: ['dem2']}), /invalid output \(CONFLICTING_OBSERVATION\)/)
        assert.deepEqual(state.exported, [])
    })

    it('fails the export for two output bands named alike, whatever its running image holds', async () => {
        const recipe = bandMath({outputNames: ['x', 'x']})
        state.recipeImages[recipe.id] = [{name: 'x', arrayDimensions: 0}, {name: 'x_1', arrayDimensions: 0}]

        await assert.rejects(submit({recipe, bands: ['x']}), /invalid output \(DUPLICATE_BAND_NAME\)/)
        assert.deepEqual(state.exported, [])
    })

    // A refusal from the configuration alone is not delayed to read the inputs it would explain: its input here lacks the
    // band it includes, which only reading it would add.
    it('fails the export for two output bands named alike at once, reading none of its inputs', async () => {
        state.assets['users/x/dem'] = {bands: [{name: 'slope', arrayDimensions: 0}], properties: {}}
        const recipe = bandMath({outputNames: ['x', 'x']})

        await assert.rejects(submit({recipe, bands: ['x']}), /invalid output \(DUPLICATE_BAND_NAME\)$/)
        assert.deepEqual(state.exported, [])
    })

    // Earth Engine cannot build an image of no bands; this used to be described as one, and fail only there.
    it('fails the export of a recipe outputting no bands, reading none of its inputs', async () => {
        state.assets['users/x/dem'] = {bands: [{name: 'slope', arrayDimensions: 0}], properties: {}}
        const recipe = bandMath({outputNames: []})

        await assert.rejects(submit({recipe, bands: []}), /invalid output \(NO_OUTPUT_BANDS\)$/)
        assert.deepEqual(state.exported, [])
    })

    // Earth Engine refuses to build an image selecting a band its input lacks, so its running image is not observed.
    it('fails the export naming a band its input lacks, though its running image cannot be observed', async () => {
        state.assets['users/x/dem'] = {bands: [{name: 'slope', arrayDimensions: 0}], properties: {}}

        await assert.rejects(submit({recipe: bandMath(), bands: ['dem2']}), /invalid output \(MISSING_INPUT_BAND\)/)
        assert.deepEqual(state.exported, [])
    })

    it('fails the export as unavailable, not as a missing band, when its input cannot be read', async () => {
        delete state.assets['users/x/dem']
        const recipe = bandMath()
        state.recipeImages[recipe.id] = RUNNING_IMAGE

        await assert.rejects(submit({recipe, bands: ['dem2']}), /unavailable output/)
        assert.deepEqual(state.exported, [])
    })

    // An input is held to its whole description, including bands Band Math does not include.
    it('fails the export when its input asset reports no dimensionality for a band it does not include', async () => {
        state.assets['users/x/dem'] = {bands: [{name: 'elevation', arrayDimensions: 0}, {name: 'quality'}], properties: {}}
        const recipe = bandMath()
        state.recipeImages[recipe.id] = RUNNING_IMAGE

        await assert.rejects(submit({recipe, bands: ['dem2']}), /invalid output \(INCOMPLETE_IMAGE_OUTPUT\)/)
        assert.deepEqual(state.exported, [])
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

        await assert.rejects(submit({recipe, bands: ['y']}), /invalid output \(DUPLICATE_BAND_NAME\)/)
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
        await assert.rejects(submit({recipe: historical(['ASCENDING', 'ASCENDING']), bands: ['VV_mean_asc']}), /invalid output \(DUPLICATE_BAND_NAME\)/)
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

    // The input's record is read to complete the closure anyway; Earth Engine is asked nothing.
    it('fails the export for two output bands named alike, naming the input with no image output beside them', async () => {
        state.catalogue = {[DESIGN.id]: DESIGN}
        const recipe = stack(
            [{imageId: 'i-1', type: 'RECIPE_REF', id: DESIGN.id}, {imageId: 'i-2', type: 'RECIPE_REF', id: DESIGN.id}],
            [mapping('i-1', [['class', 'x']]), mapping('i-2', [['class', 'x']])]
        )

        await assert.rejects(submit({recipe, bands: ['x']}), /invalid output \(NON_IMAGE_OUTPUT, DUPLICATE_BAND_NAME\)$/)
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
        await assert.rejects(submit({recipe: DESIGN, bands: ['class']}), /recipe design-1: invalid output \(NON_IMAGE_OUTPUT\)/)
        assert.deepEqual(state.exported, [])
    })

    it('fails the export of a Masking over one', async () => {
        state.catalogue = {[DESIGN.id]: DESIGN}
        const recipe = masking({primary: {type: 'RECIPE_REF', id: DESIGN.id}})

        await assert.rejects(submit({recipe, bands: ['class']}), /invalid output \(NON_IMAGE_OUTPUT\)/)
        assert.deepEqual(state.exported, [])
    })
})

// Running an image builds every image its roles need, whether or not its description reads them: a recipe over a
// Classification without training data cannot run, whichever role it takes that Classification in.
describe('exporting a recipe over a Classification without training data', () => {
    const classification = referenceData => ({
        id: 'classification-1',
        type: 'CLASSIFICATION',
        model: {
            inputImagery: {images: [{imageId: 'i-1', type: 'ASSET', id: DEM_ASSET, bandSetSpecs: [{id: 'b', type: 'IMAGE_BANDS', included: ['elevation']}]}]},
            legend: {entries: [{value: 1}, {value: 2}]},
            trainingData: {dataSets: [{type: 'COLLECTED', referenceData}]},
            classifier: {type: 'RANDOM_FOREST'}
        }
    })
    const remapping = {
        id: 'remapping-1',
        type: 'REMAPPING',
        model: {inputImagery: {images: [{imageId: 'r-1', type: 'RECIPE_REF', id: 'classification-1'}]}, legend: {entries: [{value: 1, constraints: []}]}}
    }
    const point = (x, y, value) => ({x, y, class: value})

    beforeEach(() => {
        state.assets[DEM_ASSET] = {bands: [{name: 'elevation', arrayDimensions: 0}], properties: {}}
    })

    for (const [_case, recipeOf, bands] of [
        ['a Remapping over it', () => remapping, ['class']],
        ['a Masking masked by it', () => masking({primary: {type: 'ASSET', id: DEM_ASSET}, mask: {type: 'RECIPE_REF', id: 'classification-1'}}), ['elevation']]
    ]) {
        it(format('fails the export of %s, saying why', _case), async () => {
            state.catalogue = {'classification-1': classification([])}
            const recipe = recipeOf()

            await assert.rejects(submit({recipe, bands}), /cannot run: NO_TRAINING_DATA$/)
            assert.deepEqual(state.exported, [])
        })
    }

    it('exports a Remapping over it once it has points of two classes', async () => {
        state.catalogue = {'classification-1': classification([point(1, 1, 1), point(1, 2, 1), point(2, 1, 2), point(2, 2, 2)])}

        await submit({recipe: remapping, bands: ['class']})
    })
})

// Training data reused from recipes that store no point anywhere along their own reuse is none at all, known from their
// records before anything is built (trainingData.js); one point upstream ends that.
describe('exporting a Classification reusing training data that stores no point', () => {
    const POINTS = [{x: 1, y: 1, class: 1}, {x: 1, y: 2, class: 1}, {x: 2, y: 1, class: 2}, {x: 2, y: 2, class: 2}]
    const classificationOf = (id, {points = [], reuses = []} = {}) => ({
        id,
        type: 'CLASSIFICATION',
        model: {
            inputImagery: {images: [{imageId: 'i-1', type: 'ASSET', id: DEM_ASSET, bandSetSpecs: [{id: 'b', type: 'IMAGE_BANDS', included: ['elevation']}]}]},
            legend: {entries: [{value: 1}, {value: 2}]},
            trainingData: {dataSets: [
                ...(points.length ? [{type: 'COLLECTED', referenceData: points}] : []),
                ...reuses.map(recipe => ({type: 'RECIPE', recipe}))
            ]},
            classifier: {type: 'RANDOM_FOREST'}
        }
    })

    beforeEach(() => {
        state.assets[DEM_ASSET] = {bands: [{name: 'elevation', arrayDimensions: 0}], properties: {}}
    })

    it('fails the export, saying why, and exports once a point is added upstream', async () => {
        const recipe = classificationOf('consumer-1', {reuses: ['provider-1']})
        state.catalogue = {
            'provider-1': classificationOf('provider-1', {reuses: ['nested-1']}),
            'nested-1': classificationOf('nested-1')
        }

        await assert.rejects(submit({recipe, bands: ['class']}), /cannot run: NO_TRAINING_DATA$/)
        assert.deepEqual(state.exported, [])

        state.catalogue['nested-1'] = classificationOf('nested-1', {points: POINTS})
        await submit({recipe, bands: ['class']})
    })
})

// A recipe zipping no input image cannot run, nor can a recipe whose image builds it.
describe('exporting a recipe without input imagery', () => {
    const POINTS = [{x: 1, y: 1, class: 1}, {x: 1, y: 2, class: 1}, {x: 2, y: 1, class: 2}, {x: 2, y: 2, class: 2}]
    const classification = images => ({
        id: 'classification-1',
        type: 'CLASSIFICATION',
        model: {
            inputImagery: {images},
            legend: {entries: [{value: 1}, {value: 2}]},
            trainingData: {dataSets: [{type: 'COLLECTED', referenceData: POINTS}]},
            classifier: {type: 'RANDOM_FOREST'}
        }
    })
    const demInput = () => ({imageId: 'i-1', type: 'ASSET', id: DEM_ASSET, bandSetSpecs: [{id: 'b', type: 'IMAGE_BANDS', included: ['elevation']}]})
    const remapping = {
        id: 'remapping-1',
        type: 'REMAPPING',
        model: {
            inputImagery: {images: [{imageId: 'r-1', type: 'RECIPE_REF', id: 'classification-1', includedBands: [{band: 'class'}]}]},
            legend: {entries: [{value: 1, constraints: [{image: 'r-1', band: 'class', operator: '=', value: 1}]}]}
        }
    }

    beforeEach(() => {
        state.assets[DEM_ASSET] = {bands: [{name: 'elevation', arrayDimensions: 0}], properties: {}}
    })

    for (const [_case, recipeOf, bands] of [
        ['itself', () => classification([]), ['class']],
        ['a Remapping of it', () => remapping, ['class']]
    ]) {
        it(format('fails the export of %s, saying why', _case), async () => {
            state.catalogue = {'classification-1': classification([])}

            await assert.rejects(submit({recipe: recipeOf(), bands}), /cannot run: MISSING_ROLE$/)
            assert.deepEqual(state.exported, [])
        })
    }

    it('exports a Remapping of it once it has an input image', async () => {
        state.catalogue = {'classification-1': classification([demInput()])}

        await submit({recipe: remapping, bands: ['class']})
    })
})

// Regression without training data cannot run, nor can a recipe whose image builds it.
describe('exporting a Regression without training data', () => {
    const regression = referenceData => ({
        id: 'regression-1',
        type: 'REGRESSION',
        model: {
            inputImagery: {images: [{imageId: 'i-1', type: 'ASSET', id: DEM_ASSET, bandSetSpecs: [{id: 'b', type: 'IMAGE_BANDS', included: ['elevation']}]}]},
            trainingData: {dataSets: [{type: 'EE_TABLE', eeTable: 'users/x/biomass_plots', valueColumn: 'agb', referenceData}]},
            classifier: {type: 'RANDOM_FOREST'}
        }
    })
    const remapping = {
        id: 'remapping-1',
        type: 'REMAPPING',
        model: {
            inputImagery: {images: [{imageId: 'r-1', type: 'RECIPE_REF', id: 'regression-1', includedBands: [{band: 'regression'}]}]},
            legend: {entries: [{value: 1, constraints: [{image: 'r-1', band: 'regression', operator: '>', value: 150}]}]}
        }
    }
    const PLOTS = [{x: 1, y: 1, value: 212.4}, {x: 2, y: 2, value: 87.9}]

    beforeEach(() => {
        state.assets[DEM_ASSET] = {bands: [{name: 'elevation', arrayDimensions: 0}], properties: {}}
    })

    for (const [_case, recipeOf, bands] of [
        ['itself', () => regression([]), ['regression']],
        ['a Remapping of its predictions', () => remapping, ['class']]
    ]) {
        it(format('fails the export of %s, saying why', _case), async () => {
            state.catalogue = {'regression-1': regression([])}

            await assert.rejects(submit({recipe: recipeOf(), bands}), /cannot run: NO_TRAINING_DATA$/)
            assert.deepEqual(state.exported, [])
        })
    }

    it('exports a Remapping of its predictions once a data set stores points', async () => {
        state.catalogue = {'regression-1': regression(PLOTS)}

        await submit({recipe: remapping, bands: ['class']})
    })
})

// A Remapping whose constraint reads an input it no longer lists, or a band its input does not include, cannot run, nor
// can a recipe whose image builds it.
describe('exporting a Remapping whose constraint no longer resolves', () => {
    const POINTS = [{x: 1, y: 1, class: 1}, {x: 1, y: 2, class: 1}, {x: 2, y: 1, class: 2}, {x: 2, y: 2, class: 2}]
    const CLASSIFICATION = 'classification-1'
    const classification = () => ({
        id: CLASSIFICATION,
        type: 'CLASSIFICATION',
        model: {
            inputImagery: {images: [{imageId: 'i-1', type: 'ASSET', id: DEM_ASSET, bandSetSpecs: [{id: 'b', type: 'IMAGE_BANDS', included: ['elevation']}]}]},
            legend: {entries: [{value: 1}, {value: 2}]},
            trainingData: {dataSets: [{type: 'COLLECTED', referenceData: POINTS}]},
            classifier: {type: 'RANDOM_FOREST'}
        }
    })
    // Forest, where the Classification it remaps classifies 1.
    const remappingReading = (image, band) => ({
        id: 'remapping-1',
        type: 'REMAPPING',
        model: {
            inputImagery: {images: [{imageId: 'r-1', type: 'RECIPE_REF', id: CLASSIFICATION, includedBands: [{band: 'class'}]}]},
            legend: {entries: [{value: 1, constraints: [{image, band, operator: '=', value: 1}]}]}
        }
    })
    const remappingOf = id => ({
        id: 'remapping-2',
        type: 'REMAPPING',
        model: {
            inputImagery: {images: [{imageId: 'f-1', type: 'RECIPE_REF', id, includedBands: [{band: 'class'}]}]},
            legend: {entries: [{value: 1, constraints: [{image: 'f-1', band: 'class', operator: '=', value: 1}]}]}
        }
    })

    beforeEach(() => {
        state.assets[DEM_ASSET] = {bands: [{name: 'elevation', arrayDimensions: 0}], properties: {}}
    })

    for (const [_case, image, band, code] of [
        ['an input since removed', 'r-gone', 'class', 'MISSING_CONSTRAINT_INPUT'],
        ['a band its input does not include', 'r-1', 'probability', 'CONSTRAINT_BAND_NOT_INCLUDED']
    ]) {
        it(format('fails the export of one reading %s, and of a Remapping of it, saying why', _case), async () => {
            const remapping = remappingReading(image, band)
            state.catalogue = {[CLASSIFICATION]: classification(), [remapping.id]: remapping}

            await assert.rejects(submit({recipe: remapping, bands: ['class']}), new RegExp(`cannot run: ${code}$`))
            await assert.rejects(submit({recipe: remappingOf(remapping.id), bands: ['class']}), new RegExp(`cannot run: ${code}$`))
            assert.deepEqual(state.exported, [])
        })
    }

    it('exports a Remapping of it once the constraint is repaired', async () => {
        const remapping = remappingReading('r-1', 'class')
        state.catalogue = {[CLASSIFICATION]: classification(), [remapping.id]: remapping}

        await submit({recipe: remappingOf(remapping.id), bands: ['class']})
    })

    it('refuses a used band absent from asset evidence, also downstream, and exports when the band returns', async () => {
        const remapping = remappingReading('r-1', 'elevation')
        remapping.model.inputImagery.images = [{imageId: 'r-1', type: 'ASSET', id: DEM_ASSET, includedBands: [{band: 'elevation'}]}]
        state.catalogue = {[remapping.id]: remapping}
        state.assets[DEM_ASSET].bands = [{name: 'other', arrayDimensions: 0}]
        for (const recipe of [remapping, remappingOf(remapping.id)]) {
            await assert.rejects(submit({recipe, bands: ['class']}), /cannot run: MISSING_INPUT_BAND$/)
        }
        assert.deepEqual(state.exported, [])
        state.assets[DEM_ASSET].bands = [{name: 'elevation', arrayDimensions: 0}]
        await submit({recipe: remapping, bands: ['class']})
        state.exported = []
        await submit({recipe: remappingOf(remapping.id), bands: ['class']})
    })
})

describe('exporting a Masking whose mask cannot be had', () => {
    it('fails the export of one selecting no mask, as incomplete', async () => {
        const recipe = masking({primary: {type: 'ASSET', id: MASK_ASSET}, mask: null})

        await assert.rejects(submit({recipe, bands: ['mask']}), /cannot run: MISSING_ROLE$/)
        assert.deepEqual(state.exported, [])
    })

    it('fails the export as unreadable, not as a finding, where its mask cannot be read', async () => {
        const recipe = masking({primary: {type: 'ASSET', id: MASK_ASSET}, mask: {type: 'ASSET', id: 'users/x/unreachable'}})

        await assert.rejects(submit({recipe, bands: ['mask']}), /cannot run: what it needs could not be read/)
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

        await assert.rejects(submit({recipe, bands: ['red']}), /invalid output \(INCOMPLETE_IMAGE_OUTPUT\)/)
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
        assert.ok((error.message).includes(error.cause.message))
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

// Change Alerts monitors a band its imagery observes, and uses no Classification: one its Sources copied from the
// producer of its reference is kept as saved, but is no dependency of it. What the reference itself depends on still is.
describe('exporting a Change Alerts', () => {
    const alerts = ({reference = {type: 'ASSET', id: SEGMENTS_ASSET}, ...sources} = {}) => ({
        id: 'alerts-1',
        type: 'CHANGE_ALERTS',
        model: {
            reference,
            sources: {dataSetType: 'OPTICAL', dataSets: {LANDSAT: ['LANDSAT_8']}, band: 'ndvi', ...sources},
            options: {corrections: ['SR']},
            date: {monitoringEnd: '2024-01-01', monitoringDuration: 1, monitoringDurationUnit: 'months', calibrationDuration: 2, calibrationDurationUnit: 'months'}
        }
    })
    const SEGMENTS_ASSET = 'users/x/segments'
    // A Classification of another user's, named by the asset's exported recipe_sources: this one cannot read it.
    const INACCESSIBLE = 'colleagues-classification'

    beforeEach(() => {
        state.assets[SEGMENTS_ASSET] = {bands: [{name: 'tStart', arrayDimensions: 1}], properties: {}}
    })

    it('exports over a shared segments asset, though the Classification its Sources copied cannot be read', async () => {
        const recipe = alerts({classification: INACCESSIBLE, breakpointBands: ['ndvi']})

        await submit({recipe, bands: ['confidence']})

        assert.deepEqual(state.recipeReads, [])
    })

    it('is refused where the CCDC it references depends on a Classification that cannot be read', async () => {
        const ccdc = {
            id: 'ccdc-1',
            type: 'CCDC',
            model: {sources: {dataSets: {LANDSAT: ['LANDSAT_8']}, breakpointBands: ['ndvi'], classification: INACCESSIBLE}}
        }
        state.catalogue = {[ccdc.id]: ccdc}

        await assert.rejects(
            submit({recipe: alerts({reference: {type: 'RECIPE_REF', id: ccdc.id}}), bands: ['confidence']}),
            error => error.message === `Recipe could not be read: ${INACCESSIBLE}`
        )
        assert.deepEqual(state.exported, [])
    })

    it('is refused at its band where that is one a Classification computes', async () => {
        await assert.rejects(
            submit({recipe: alerts({band: 'regression', classification: INACCESSIBLE}), bands: ['confidence']}),
            /cannot run: CLASSIFIED_MONITORED_BAND$/
        )
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

const DEM_ASSET = 'users/x/dem'
const MASK_ASSET = 'users/x/mask'

// Masked, unless a test says otherwise, by an asset that can be read.
const masking = ({primary, mask = {type: 'ASSET', id: MASK_ASSET}}) => ({
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
    assert.equal((state.exported).length, 1)
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

mock.module('#sepal/ee/ee', {exports: {
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
}})
mock.module('#sepal/ee/recipe', {exports: {
    loadRecipe$: id => {
        state.recipeReads.push(id)
        return state.catalogue[id]
            ? of(state.catalogue[id])
            : throwError(() => new Error(`Recipe could not be read: ${id}`))
    }
}})
mock.module('#sepal/ee/imageFactory', {exports: {
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
}})
mock.module('#gee/jobs/task/export/toAsset', {exports: {
    startImageToAssetExport$: args => {
        state.exported.push(args)
        return of({eeTaskId: 'T1', assetId: args.assetId})
    }
}})

beforeEach(() => {
    state.catalogue = {}
    state.assets = {[MASK_ASSET]: {bands: [{name: 'mask', arrayDimensions: 0}], properties: {}}}
    state.recipeImages = {}
    state.recipeBands = {}
    state.recipeReads = []
    state.exported = []
})
