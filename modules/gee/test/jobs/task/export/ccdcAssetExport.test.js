import assert from 'node:assert/strict'
import {beforeEach, describe, it, mock} from 'node:test'

import {lastValueFrom, of, throwError} from 'rxjs'

import {assetProcessing, effectiveSettings} from '#sepal/recipe/changeAlerts/processing'

// What an existing CCDC Segments asset contains. These are characterization tests: they pin the format already
// written into every asset users hold, so that anything reading one later can be held to the same shape.
//
// Only the Earth Engine boundary, recipe reads and the export job are mocked. `formatProperties` and
// `toVisualizationProperties` run for real, because the serialized property strings ARE the contract - a reader parses
// those exact bytes - and so do the closure, the declarations and the readiness the export is held to.

const captured = {}
const state = {catalogue: {}, catalogueUnreadable: false, assets: {}, observed: []}

beforeEach(() => {
    delete captured.ccdc
    delete captured.export
    state.catalogue = {}
    state.catalogueUnreadable = false
    state.assets = {}
    state.observed = []
})

const geometry = {bounds: () => 'region-bounds'}

mock.module('#sepal/ee/timeSeries/ccdc', {
    exports: {
        default: (recipe, options) => {
            captured.ccdc = {recipe, options}
            return {
                getImage$: () => of('segments-image'),
                getGeometry$: () => of(geometry)
            }
        }
    }
})
// What reading an asset's bands evaluates (bandEvidence.js): an image whose bands a scenario states.
const assetImage = bands => ({
    bandNames: () => ({map: mapper => bands.map(({name}) => mapper(name))}),
    bandTypes: () => ({get: name => bands.find(band => band.name === name)}),
    toDictionary: () => ({})
})
mock.module('#sepal/ee/ee', {
    exports: {
        default: {
            // Readiness's own evidence of an asset's bands, no work of the export's.
            getAsset$: id => {
                state.observed.push(id)
                return state.assets[id]
                    ? of({type: 'Image'})
                    : throwError(() => new Error(`Asset could not be read: ${id}`))
            },
            Image: id => assetImage(state.assets[id] ?? []),
            Dictionary: values => values,
            PixelType: band => ({dimensions: () => band.arrayDimensions}),
            getInfo$: value => of(value)
        }
    }
})
mock.module('#sepal/ee/recipe', {
    exports: {
        loadRecipe$: id => state.catalogue[id]
            ? of(state.catalogue[id])
            : throwError(() => new Error(`Recipe could not be read: ${id}`))
    }
})
// What CCDC is asked for, without building it: the measures its collection can supply.
mock.module('#sepal/ee/imageFactory', {
    exports: {
        default: () => ({
            getBands$: () => state.catalogueUnreadable
                ? throwError(() => new Error('Recipe bands could not be read'))
                : of(['ndvi', 'swir1'])
        })
    }
})
mock.module('#gee/jobs/task/export/toAsset', {
    exports: {
        startImageToAssetExport$: args => {
            captured.export = {args}
            return of({eeTaskId: 'T1', assetId: args.assetId})
        }
    }
})

const {startCcdcAssetExport$} = await import('#gee/jobs/task/export/ccdcAssetExport')

const CLASSIFICATION = 'classification-1'

const recipe = ({corrections = ['SR']} = {}) => ({
    id: 'ccdc-1',
    type: 'CCDC',
    model: {
        dates: {startDate: '2015-01-01', endDate: '2020-01-01'},
        ccdcOptions: {dateFormat: 1},
        options: {corrections}
    }
})

// Visualizations reach the task already normalized by the GUI, so the fixtures are what normalize() produces.
const NDVI = {
    type: 'continuous',
    bands: ['ndvi'],
    baseBands: ['ndvi'],
    min: [-10000],
    max: [10000],
    palette: ['#FF0000', '#00FF00'],
    inverted: [false]
}

// A harmonic template. Its bands are the LOGICAL coefficient bands Slice derives; none of them is a band the
// asset physically carries.
const HARMONIC = {
    type: 'hsv',
    bands: ['ndvi_phase_1', 'ndvi_amplitude_1', 'ndvi_rmse'],
    baseBands: ['ndvi'],
    min: [-3.141592653589793, 0, 0],
    max: [3.141592653589793, 3000, 2500],
    inverted: [false, false, true],
    gamma: [1, 1, 1]
}

const submit = async ({model = recipe(), bands = ['ndvi'], visualizations = [], properties, scale = 30} = {}) => {
    await lastValueFrom(startCcdcAssetExport$({
        image: {
            recipe: model,
            bands,
            scale,
            visualizations,
            properties,
            assetId: 'users/me/my-ccdc'
        },
        description: 'my-ccdc'
    }))
    return captured.export.args
}

const visualizationProperties = properties =>
    Object.fromEntries(Object.entries(properties).filter(([key]) => key.startsWith('visualization_')))

// Every CCDC Segments export is held to what the recipe's image output requires (imageOutput.js), by the real
// resolution and readiness: a recipe that cannot run is refused before its segments are built or submitted.
describe('a CCDC Segments export held to what its recipe requires', () => {
    const classified = () => {
        const model = recipe()
        model.model.sources = {dataSets: {LANDSAT: ['LANDSAT_8']}, classification: CLASSIFICATION}
        return model
    }
    // Trained on points over `included` of an asset, observed with them: every CCDC export trains it (type/ccdc.js).
    const classification = included => {
        state.assets['users/x/input'] = included.map(name => ({name, arrayDimensions: 0}))
        return {
            id: CLASSIFICATION,
            type: 'CLASSIFICATION',
            model: {
                inputImagery: {images: [{imageId: 'i-1', type: 'ASSET', id: 'users/x/input', bandSetSpecs: [{id: 'b', type: 'IMAGE_BANDS', included}]}]},
                legend: {entries: [{value: 1}, {value: 2}]},
                trainingData: {dataSets: [{type: 'COLLECTED', referenceData: [{x: 1, y: 1, class: 1}, {x: 2, y: 2, class: 2}]}]},
                classifier: {type: 'RANDOM_FOREST'}
            }
        }
    }

    it('is refused where its classification\'s classifier the Landsat scenes cannot feed, building and submitting nothing', async () => {
        state.catalogue[CLASSIFICATION] = classification(['VV_mean', 'VH_med'])

        await assert.rejects(submit({model: classified()}), /cannot run: UNSUPPLIED_CLASSIFIER_INPUTS$/)
        assert.equal(captured.ccdc, undefined)
        assert.equal(captured.export, undefined)
    })

    it('exports as before once its classification is one the scenes can feed', async () => {
        state.catalogue[CLASSIFICATION] = classification(['red', 'nir', 'ndvi'])

        const {pyramidingPolicy, maxPixels, region, scale, image, properties} = await submit({model: classified(), bands: ['ndvi', 'swir1']})

        assert.deepEqual(captured.ccdc.options, {selection: ['ndvi', 'swir1']})
        assert.deepEqual(pyramidingPolicy, {'.default': 'sample'})
        assert.equal(maxPixels, 1e13)
        assert.equal(region, 'region-bounds')
        assert.equal(scale, 30)
        assert.equal(image, 'segments-image')
        assert.equal(properties.dateFormat, 1)
    })

    it('fails, building and submitting nothing, where its classification cannot be read', async () => {
        await assert.rejects(submit({model: classified()}), /Recipe could not be read: classification-1/)
        assert.equal(captured.ccdc, undefined)
        assert.equal(captured.export, undefined)
    })

    it('fails as unavailable, not as a finding, where what it can be asked for cannot be read', async () => {
        state.catalogueUnreadable = true

        await assert.rejects(submit(), /unavailable output/)
        assert.equal(captured.ccdc, undefined)
        assert.equal(captured.export, undefined)
    })
})

// The Classification a CCDC's Sources select is part of its analysis: what training it needs refuses the export,
// whichever its breakpoint bands are - one it computes, which trains it, or bands of the images alike.
describe('exporting a CCDC over a Classification that cannot be trained, whatever its breakpoint bands', () => {
    const POINTS = [{x: 1, y: 1, class: 1}, {x: 1, y: 2, class: 1}, {x: 2, y: 1, class: 2}, {x: 2, y: 2, class: 2}]
    const OPTICAL_ASSET = 'users/x/optical'
    const classificationOf = ({points = []} = {}) => ({
        id: CLASSIFICATION,
        type: 'CLASSIFICATION',
        model: {
            inputImagery: {images: [{imageId: 'i-1', type: 'ASSET', id: OPTICAL_ASSET, bandSetSpecs: [{id: 'b', type: 'IMAGE_BANDS', included: ['red', 'nir']}]}]},
            legend: {entries: [{value: 1}, {value: 2}]},
            trainingData: {dataSets: points.length ? [{type: 'COLLECTED', referenceData: points}] : []},
            classifier: {type: 'RANDOM_FOREST'}
        }
    })
    const fitting = breakpointBands => {
        const model = recipe()
        model.model.sources = {dataSets: {LANDSAT: ['LANDSAT_8']}, breakpointBands, classification: CLASSIFICATION}
        return model
    }

    beforeEach(() => {
        state.assets[OPTICAL_ASSET] = [{name: 'red', arrayDimensions: 0}, {name: 'nir', arrayDimensions: 0}]
    })

    it('fails the export, saying why, building nothing, and exports once the Classification stores points', async () => {
        const model = fitting(['ndvi', 'probability_1'])
        state.catalogue[CLASSIFICATION] = classificationOf()

        await assert.rejects(submit({model}), /cannot run: NO_TRAINING_DATA$/)
        assert.equal(captured.ccdc, undefined)
        assert.equal(captured.export, undefined)

        state.catalogue[CLASSIFICATION] = classificationOf({points: POINTS})
        const {image} = await submit({model})
        assert.equal(image, 'segments-image')
    })

    it('fails the export of breakpoint bands of the images too, building nothing, and exports once the Classification stores points', async () => {
        const model = fitting(['ndvi'])
        state.catalogue[CLASSIFICATION] = classificationOf()

        await assert.rejects(submit({model}), /cannot run: NO_TRAINING_DATA$/)
        assert.equal(captured.ccdc, undefined)

        state.catalogue[CLASSIFICATION] = classificationOf({points: POINTS})
        const {image} = await submit({model})
        assert.equal(image, 'segments-image')
    })
})

// What training the Classification needs refuses the export before the segments are built, as the CCDC's own
// configuration does, whatever measures it names - one the Classification computes, fitted with the breakpoint bands,
// or measures of the images alike. Then the measures named must be ones the Classification provides.
describe('exporting the measures a CCDC fits over its Classification', () => {
    const PROVIDER = 'provider-1'
    const CLASSIFIED = 'probability_1'
    const SVM = {type: 'SVM', svmType: 'C_SVC'}
    const POINTS = [{x: 1, y: 1, class: 1}, {x: 1, y: 2, class: 1}, {x: 2, y: 1, class: 2}, {x: 2, y: 2, class: 2}]
    const inputOf = id => `users/x/${id}-input`
    const trainable = ({id = CLASSIFICATION, included = ['red', 'nir'], images, points = POINTS, reuses = [], classifier = {type: 'RANDOM_FOREST'}} = {}) => {
        state.assets[inputOf(id)] = included.map(name => ({name, arrayDimensions: 0}))
        return {
            id,
            type: 'CLASSIFICATION',
            model: {
                inputImagery: {images: images ?? [{imageId: 'i-1', type: 'ASSET', id: inputOf(id), bandSetSpecs: [{id: 'b', type: 'IMAGE_BANDS', included}]}]},
                legend: {entries: [{value: 1}, {value: 2}]},
                classifier,
                trainingData: {dataSets: [
                    ...(points.length ? [{dataSetId: 'collected', type: 'COLLECTED', referenceData: points}] : []),
                    ...reuses.map(recipe => ({dataSetId: recipe, type: 'RECIPE', recipe}))
                ]}
            }
        }
    }
    const fitting = (breakpointBands = ['ndvi']) => {
        const model = recipe()
        model.model.sources = {dataSets: {LANDSAT: ['LANDSAT_8']}, breakpointBands, classification: CLASSIFICATION}
        return model
    }
    const assertNothingBuilt = () => {
        assert.equal(captured.ccdc, undefined)
        assert.equal(captured.export, undefined)
    }

    for (const [_case, catalogue, code] of [
        ['stores no points', () => ({[CLASSIFICATION]: trainable({points: []})}), 'NO_TRAINING_DATA'],
        ['reuses a recipe without input imagery', () => ({[CLASSIFICATION]: trainable({reuses: [PROVIDER]}), [PROVIDER]: trainable({id: PROVIDER, images: []})}), 'MISSING_ROLE'],
        ['reuses a recipe sampling fewer features', () => ({[CLASSIFICATION]: trainable({reuses: [PROVIDER]}), [PROVIDER]: trainable({id: PROVIDER, included: ['red']})}), 'MISSING_TRAINING_FEATURES']
    ]) {
        for (const bands of [['ndvi', CLASSIFIED], ['ndvi', 'swir1']]) {
            it(`is refused for ${bands.join(', ')}, building and submitting nothing, where the Classification ${_case}`, async () => {
                state.catalogue = catalogue()

                await assert.rejects(submit({model: fitting(), bands}), new RegExp(`ccdc-1 cannot run: ${code}$`))

                assertNothingBuilt()
            })
        }
    }

    it('exports once the Classification stores points again', async () => {
        state.catalogue = {[CLASSIFICATION]: trainable({points: []})}
        await assert.rejects(submit({model: fitting(), bands: [CLASSIFIED]}), /NO_TRAINING_DATA$/)

        state.catalogue = {[CLASSIFICATION]: trainable()}
        const {image} = await submit({model: fitting(), bands: [CLASSIFIED]})

        assert.equal(image, 'segments-image')
        assert.deepEqual(captured.ccdc.options, {selection: [CLASSIFIED]})
    })

    // Judged as what is built, whatever type is stated: MOSAIC declares no need of a Classification at all.
    for (const type of ['TIME_SERIES', 'MOSAIC']) {
        it(`is refused, building and submitting nothing, for a recipe stated as ${type}, whose segments are built as a CCDC's`, async () => {
            state.catalogue = {[CLASSIFICATION]: trainable({points: []})}

            await assert.rejects(submit({model: {...fitting(), type}, bands: [CLASSIFIED]}), /ccdc-1 cannot run: NO_TRAINING_DATA$/)

            assertNothingBuilt()
        })
    }

    it('exports a recipe stated as another type as before, its segments built as a CCDC\'s, once its Classification can be trained', async () => {
        state.catalogue = {[CLASSIFICATION]: trainable()}

        const {image} = await submit({model: {...fitting(), type: 'MOSAIC'}, bands: [CLASSIFIED]})

        assert.equal(image, 'segments-image')
        assert.deepEqual(captured.ccdc.options, {selection: [CLASSIFIED]})
    })

    it('fails with what could not be read, as no finding and building nothing, where the Classification\'s input cannot be observed', async () => {
        state.catalogue = {[CLASSIFICATION]: trainable()}
        delete state.assets[inputOf(CLASSIFICATION)]

        await assert.rejects(submit({model: fitting(), bands: [CLASSIFIED]}), /cannot run: what it needs could not be read: Asset could not be read: users\/x\/classification-1-input$/)

        assertNothingBuilt()
    })

    it('is refused for a classified breakpoint band\'s training before a requested output the Classification does not provide', async () => {
        state.catalogue = {[CLASSIFICATION]: trainable({points: [], classifier: SVM})}

        await assert.rejects(submit({model: fitting(['ndvi', CLASSIFIED]), bands: ['regression']}), /ccdc-1 cannot run: NO_TRAINING_DATA$/)

        assertNothingBuilt()
    })

    it('is refused for a classified breakpoint band\'s training whatever measures of the images it names', async () => {
        state.catalogue = {[CLASSIFICATION]: trainable({points: []})}

        await assert.rejects(submit({model: fitting(['ndvi', CLASSIFIED]), bands: ['ndvi']}), /ccdc-1 cannot run: NO_TRAINING_DATA$/)

        assertNothingBuilt()
    })

    it('is refused for an output its trainable Classification does not provide as a client\'s error, building nothing', async () => {
        state.catalogue = {[CLASSIFICATION]: trainable({classifier: SVM})}

        await assert.rejects(submit({model: fitting(), bands: ['ndvi', 'regression']}), error =>
            error.errorCode === 'UNSUPPORTED_CLASSIFIED_OUTPUT' && error.statusCode === 400
            && error.message === `Classification ${CLASSIFICATION} does not provide regression`)

        assertNothingBuilt()
    })

    // What the configuration needs comes first: the Classification's training before an output asked of it.
    it('is refused for the Classification\'s training before an output it does not provide, building nothing', async () => {
        state.catalogue = {[CLASSIFICATION]: trainable({points: [], classifier: SVM})}

        await assert.rejects(submit({model: fitting(), bands: ['ndvi', 'regression']}), /ccdc-1 cannot run: NO_TRAINING_DATA$/)

        assertNothingBuilt()
    })

    it('is refused for a configured breakpoint band the Classification does not provide, as the configuration\'s finding', async () => {
        state.catalogue = {[CLASSIFICATION]: trainable({classifier: SVM})}

        await assert.rejects(submit({model: fitting(['ndvi', 'regression']), bands: ['regression']}), error =>
            /ccdc-1 cannot run: UNSUPPORTED_CLASSIFIED_OUTPUT$/.test(error.message) && error.errorCode === undefined)

        assertNothingBuilt()
    })

    it('is refused for classifier inputs the scenes cannot feed before anything the measures add', async () => {
        state.catalogue = {[CLASSIFICATION]: trainable({included: ['VV_mean', 'VH_med'], classifier: SVM})}

        await assert.rejects(submit({model: fitting(), bands: ['regression']}), /ccdc-1 cannot run: UNSUPPLIED_CLASSIFIER_INPUTS$/)

        assertNothingBuilt()
    })

    it('writes the asset as before once it can run, a classified measure among those it names', async () => {
        state.catalogue = {[CLASSIFICATION]: trainable()}

        const {pyramidingPolicy, maxPixels, region, properties} = await submit({model: fitting(), bands: ['ndvi', CLASSIFIED], visualizations: [NDVI]})

        assert.deepEqual(pyramidingPolicy, {'.default': 'sample'})
        assert.equal(maxPixels, 1e13)
        assert.equal(region, 'region-bounds')
        assert.equal(properties.dateFormat, 1)
        assert.equal(visualizationProperties(properties).visualization_0_bands, 'ndvi')
    })
})

describe('the CCDC Segments asset export', () => {
    it('writes an array-band asset with sample pyramiding', async () => {
        const {pyramidingPolicy, maxPixels, region, scale, image} = await submit()

        assert.deepEqual(pyramidingPolicy, {'.default': 'sample'})
        assert.equal(maxPixels, 1e13)
        assert.equal(region, 'region-bounds')
        assert.equal(scale, 30)
        assert.equal(image, 'segments-image')
    })

    it('passes the retrieve band selection to the segment builder', async () => {
        await submit({bands: ['ndvi', 'swir1']})

        assert.deepEqual(captured.ccdc.options, {selection: ['ndvi', 'swir1']})
    })
})

// Of the properties written here, CCDC Slice reads exactly three: dateFormat, startDate and endDate. Everything
// else it needs it derives from the asset's band names.
describe('the date metadata CCDC Slice reads back', () => {
    it('records the segment date range and date format', async () => {
        const {properties} = await submit()

        assert.equal(properties.startDate, '2015-01-01')
        assert.equal(properties.endDate, '2020-01-01')
        assert.equal(properties.dateFormat, 1)
    })

})

// Written into every asset, read by nothing in Slice. Its three-valued shape is recorded because a future reader
// would have to cope with all three - and one of the two real assets omits it entirely.
describe('the surface reflectance flag, which Slice does not read', () => {
    it('records surface reflectance as 1 when the correction was applied', async () => {
        const {properties} = await submit({model: recipe({corrections: ['SR']})})

        assert.equal(properties.surfaceReflectance, 1)
    })

    // Not 0 and not absent - `corrections.includes('SR') && 1` yields the boolean.
    it('records surface reflectance as false when it was not', async () => {
        const {properties} = await submit({model: recipe({corrections: []})})

        assert.equal(properties.surfaceReflectance, false)
    })

    it('records it as undefined when the recipe carries no corrections at all', async () => {
        const model = recipe()
        delete model.model.options.corrections
        const {properties} = await submit({model})

        assert.equal(properties.surfaceReflectance, undefined)
    })
})

describe('the formatted recipe properties', () => {
    it('writes them as top-level properties, passing strings and numbers through and serializing everything else', async () => {
        const {properties} = await submit({
            scale: 30,
            properties: {
                recipe_id: 'ccdc-1',
                recipe_title: 'My CCDC',
                recipe_dates: {startDate: '2015-01-01'},
                recipe_bands: ['ndvi'],
                'system:time_start': 1420070400000
            }
        })

        assert.equal(properties.recipe_id, 'ccdc-1')
        assert.equal(properties.recipe_title, 'My CCDC')
        assert.equal(properties.recipe_dates, '{"startDate":"2015-01-01"}')
        assert.equal(properties.recipe_bands, '["ndvi"]')
        assert.equal(properties['system:time_start'], 1420070400000)
        assert.equal(properties.scale, 30)
        assert.equal(properties.formattedProperties, undefined)
    })
})

describe('the serialized visualizations', () => {
    it('writes every field of a visualization, one property per key', async () => {
        const {properties} = await submit({visualizations: [NDVI]})

        assert.deepEqual(visualizationProperties(properties), {
            visualization_0_type: 'continuous',
            visualization_0_bands: 'ndvi',
            visualization_0_baseBands: 'ndvi',
            visualization_0_min: '-10000',
            visualization_0_max: '10000',
            visualization_0_palette: '#FF0000,#00FF00',
            visualization_0_inverted: 'false',
            visualization_0_name: 'ndvi'
        })
    })

    // Every array-valued field becomes a comma-joined string, a one-element array included: `min: [-10000]` is
    // written as the string '-10000', not the number. Nothing in the asset records that it was ever a number.
    it('writes numbers and booleans as strings once they are in an array', async () => {
        const {properties} = await submit({visualizations: [NDVI]})

        assert.equal(typeof properties.visualization_0_min, 'string')
        assert.equal(typeof properties.visualization_0_inverted, 'string')
    })

    // baseBands is not a rendering parameter. It says which logical CCDC band the template belongs to, and it is
    // serialized like any other field because the writer serializes whatever the visualization carries.
    it('carries baseBands through as an ordinary field', async () => {
        const {properties} = await submit({visualizations: [HARMONIC]})

        assert.equal(properties.visualization_0_baseBands, 'ndvi')
        assert.equal(
            properties.visualization_0_bands,
            'ndvi_phase_1,ndvi_amplitude_1,ndvi_rmse'
        )
    })

    // The generated name joins the bands with ', ' and is then escaped like any other string, so every asset
    // carries backslashes inside its auto-generated names. The escaping itself is correct and is part of the
    // format; that nothing on the read side undoes it for `name` is the defect, and it lives in the parser.
    it('names a visualization by its bands, with the separators escaped', async () => {
        const {properties} = await submit({visualizations: [HARMONIC]})

        assert.equal(
            properties.visualization_0_name,
            'ndvi_phase_1\\, ndvi_amplitude_1\\, ndvi_rmse'
        )
    })

    it('keeps an explicit name', async () => {
        const {properties} = await submit({visualizations: [{...NDVI, name: 'Greenness'}]})

        assert.equal(properties.visualization_0_name, 'Greenness')
    })

    it('escapes commas inside a value so the list separator stays unambiguous', async () => {
        const {properties} = await submit({
            visualizations: [{
                type: 'categorical',
                name: 'Land cover',
                bands: ['ndvi'],
                values: [1, 2],
                labels: ['Forest, dense', 'Water'],
                palette: ['#00FF00', '#0000FF']
            }]
        })

        assert.equal(properties.visualization_0_labels, 'Forest\\, dense,Water')
        assert.equal(properties.visualization_0_values, '1,2')
    })

    it('numbers each visualization in order', async () => {
        const {properties} = await submit({visualizations: [NDVI, HARMONIC]})

        assert.equal(properties.visualization_0_bands, 'ndvi')
        assert.equal(
            properties.visualization_1_bands,
            'ndvi_phase_1,ndvi_amplitude_1,ndvi_rmse'
        )
    })

    it('keeps only the first of two visualizations sharing a name', async () => {
        const {properties} = await submit({
            visualizations: [NDVI, {...NDVI, palette: ['#000000', '#FFFFFF']}]
        })

        assert.equal(properties.visualization_0_palette, '#FF0000,#00FF00')
        assert.equal(properties.visualization_1_palette, undefined)
    })
})

// The filter admits visualizations by a LOGICAL band vocabulary - base bands plus every coefficient, timing and
// residual band Slice can derive - which is not the set of bands the asset physically carries. `_coefs` is the
// physical array band and is absent from that vocabulary; `_phase_1` is derived and present.
describe('the band vocabulary a visualization is admitted against', () => {
    const admitted = async visualization =>
        Object.keys(visualizationProperties((await submit({visualizations: [visualization]})).properties)).length > 0

    it('admits a template on derived coefficient bands the asset never physically carries', async () => {
        assert.equal(await admitted(HARMONIC), true)
    })

    it('admits templates on rmse and magnitude, which the asset does carry', async () => {
        assert.equal(await admitted({...NDVI, bands: ['ndvi_rmse'], name: 'rmse'}), true)
        assert.equal(
            await admitted({...NDVI, bands: ['ndvi_magnitude'], name: 'magnitude'}),
            true
        )
    })

    it('admits templates on the segment bands', async () => {
        assert.equal(await admitted({...NDVI, bands: ['tStart'], name: 'tStart'}), true)
        assert.equal(await admitted({...NDVI, bands: ['changeProb'], name: 'changeProb'}), true)
    })

    // The physical array band itself. A visualization naming it is dropped, so no asset carries one.
    it('rejects a template on the physical coefficient array band', async () => {
        assert.equal(await admitted({...NDVI, bands: ['ndvi_coefs'], name: 'coefs'}), false)
    })

    it('rejects a template naming a band outside the retrieve selection', async () => {
        assert.equal(await admitted({...NDVI, bands: ['swir1'], name: 'swir1'}), false)
    })

    it('rejects a multi-band template when only some of its bands are selected', async () => {
        assert.equal(await admitted({...NDVI, bands: ['ndvi', 'swir1'], name: 'mixed'}), false)
    })
})

describe('executed processing metadata', () => {
    it('records the specialized CCDC computation even when the request claims another type or provenance', async () => {
        const executed = {...recipe({corrections: ['BRDF']}), type: 'MOSAIC'}
        executed.model.sources = {dataSetType: 'OPTICAL', dataSets: {LANDSAT: ['LANDSAT_8']}, cloudPercentageThreshold: 31}
        executed.model.options.brdfMultiplier = 3
        const {properties} = await submit({model: executed, properties: {processing: '{"options":{"corrections":["SR"]}}', recipe_options: {corrections: ['SR']}}})
        const read = effectiveSettings({options: {corrections: ['SR']}}, assetProcessing(properties))
        assert.deepEqual(read.model.options.corrections, ['BRDF'])
        assert.equal(read.model.options.brdfMultiplier, 3)
        assert.equal(read.fields.dateFormat.value, 1)
        assert.equal(read.fields.SR.state, 'RECORDED')
        assert.deepEqual(JSON.parse(properties.processing).dataSets, executed.model.sources.dataSets)
    })
})
