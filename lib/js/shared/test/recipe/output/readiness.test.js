import assert from 'node:assert/strict'
import {describe, it} from 'node:test'
import {format, isDeepStrictEqual} from 'node:util'

import {firstValueFrom, of, throwError} from 'rxjs'

import {explainImageOutput$, settledImageOutput$} from '#sepal/recipe/output/observeImageOutput'
import {readImageOutput} from '#sepal/recipe/output/readImageOutput'
import {recipeType} from '#sepal/recipe/recipeTypeRegistry'
import {buildRecipeDependencyGraph} from '#sepal/recipe/source/dependencyGraph'
import {assertMatches} from '#sepal/testSupport/assert'

// Whether running a recipe's image is possible, beside which bands it provides: its own configuration's requirements,
// and every recipe and asset whose image running it builds - by the roles its type says it needs - described and judged
// the same way, whether or not its description read them. A Classification without training data is described and
// cannot run, and neither can a Stack, a Remapping, or a Masking over it by either image. What is not yet observed is
// needed, never found; what is found stays found beside it. Codes, statuses and persisted field names are literals.

describe('over a Classification without training data', () => {
    for (const [_case, recipeOf] of [
        ['a Stack, which reads it', () => stack(CLASSIFICATION)],
        ['a Remapping, which reads nothing of it', () => remapping(CLASSIFICATION)],
        ['a Masking, masked by it', () => masking({image: MOSAIC, mask: CLASSIFICATION})],
        ['a Masking of it', () => masking({image: CLASSIFICATION, mask: MOSAIC})]
    ]) {
        it(format('%s is described, and cannot run for the Classification\'s training data', _case), () => {
            const recipe = recipeOf()

            const result = read(recipe, [classification(), MOSAIC])

            assert.equal(result.status, 'READY')
            assert.equal(result.readiness.status, 'NOT_READY')
            assert.deepEqual(result.readiness.findings, [{
                code: 'NO_TRAINING_DATA', path: ['model', 'trainingData', 'dataSets'], recipePath: [recipe.id, CLASSIFICATION]
            }])
        })
    }

    it('a Remapping can run once the Classification has points of two classes', () => {
        const recipe = remapping(CLASSIFICATION)

        const result = read(recipe, [classification(TRAINING_POINTS), MOSAIC])

        assert.deepEqual(result.readiness, {status: 'READY', findings: [], needs: {records: [], observations: []}})
    })
})

describe('a Remapping over a Classification of an asset not yet observed', () => {
    it('waits for that observation, though its own bands need none', () => {
        const result = read(remapping(CLASSIFICATION), [classification(TRAINING_POINTS, DEM_INPUT)])

        assert.equal(result.status, 'READY')
        assert.equal(result.readiness.status, 'NEEDS_EVIDENCE')
        assert.deepEqual(result.needs.observations, [{type: 'ASSET', id: DEM}])
    })

    it('cannot run once it is observed lacking a band the Classification selects', () => {
        const result = read(remapping(CLASSIFICATION), [classification(TRAINING_POINTS, DEM_INPUT)], {[DEM]: ['slope']})

        assert.equal(result.readiness.status, 'NOT_READY')
        assert.deepEqual(result.readiness.findings.map(({code, recipePath}) => [code, recipePath]), [
            ['MISSING_INPUT_BAND', [REMAPPING, CLASSIFICATION]]
        ])
    })

    it('can run once a later observation holds that band: nothing found before is kept', () => {
        const result = read(remapping(CLASSIFICATION), [classification(TRAINING_POINTS, DEM_INPUT)], {[DEM]: ['elevation']})

        assert.equal(result.readiness.status, 'READY')
    })

    it('cannot run for the Classification\'s training data while the observation is still needed', () => {
        const result = read(remapping(CLASSIFICATION), [classification([], DEM_INPUT)])

        assert.equal(result.readiness.status, 'NOT_READY')
        assert.deepEqual(result.readiness.findings.map(({code}) => code), ['NO_TRAINING_DATA'])
        assert.deepEqual(result.readiness.needs.observations, [{type: 'ASSET', id: DEM}])
    })
})

describe('a settled read of a Remapping over a Classification of an asset', () => {
    it('cannot run, unavailable, where the observation fails, its bands still described', async () => {
        const result = await settle(remapping(CLASSIFICATION), [classification(TRAINING_POINTS, DEM_INPUT)], () => throwError(() => new Error('Earth Engine unreachable')))

        assert.equal(result.status, 'READY')
        assert.deepEqual(result.description.output.bands.map(({name}) => name), ['class'])
        assertMatches(result.readiness, {status: 'UNAVAILABLE', findings: []})
    })

    it('can run where the observation holds what the Classification selects', async () => {
        const result = await settle(remapping(CLASSIFICATION), [classification(TRAINING_POINTS, DEM_INPUT)], () => of([{name: 'elevation', arrayDimensions: 0}]))

        assert.equal(result.readiness.status, 'READY')
    })

    it('cannot run for the Classification\'s training data at once, observing nothing more', async () => {
        const observed = []

        const result = await settle(remapping(CLASSIFICATION), [classification([], DEM_INPUT)], request => {
            observed.push(request.reference)
            return of([{name: 'slope', arrayDimensions: 0}])
        })

        assert.deepEqual(result.readiness.findings.map(({code}) => code), ['NO_TRAINING_DATA'])
        assert.deepEqual(observed, [])
    })
})

describe('a settled read of a Stack over a Classification of an asset, without training data', () => {
    it('keeps what the Classification\'s configuration establishes beside the observation its description needed, failed', async () => {
        const observed = []

        const result = await settle(stack(CLASSIFICATION), [classification([], DEM_INPUT)], request => {
            observed.push(request.reference)
            return throwError(() => new Error('Earth Engine unreachable'))
        })

        assert.deepEqual(observed, [{type: 'ASSET', id: DEM}])
        assert.equal(result.status, 'UNAVAILABLE')
        assert.equal(result.readiness.status, 'NOT_READY')
        assert.deepEqual(result.readiness.findings.map(({code}) => code), ['NO_TRAINING_DATA'])
        assert.deepEqual(result.readiness.failures.map(({message}) => message), ['Earth Engine unreachable'])
    })
})

// What an editor reads to explain why it cannot run: what that still needs, observed once, each on its own.
describe('a Remapping over a Classification of an asset, without training data, explained', () => {
    it('observes the asset, and finds the band it lacks beside the training data', async () => {
        const observed = []

        const explanation = await explain(remapping(CLASSIFICATION), [classification([], DEM_INPUT)], request => {
            observed.push(request.reference)
            return of([{name: 'slope', arrayDimensions: 0}])
        })

        assert.deepEqual(observed, [{type: 'ASSET', id: DEM}])
        assert.ok(([
            ['NO_TRAINING_DATA', [REMAPPING, CLASSIFICATION]],
            ['MISSING_INPUT_BAND', [REMAPPING, CLASSIFICATION]]
        ]).every(expected => (explanation.findings.map(({code, recipePath}) => [code, recipePath])).some(actual => isDeepStrictEqual(actual, expected))))
        assert.equal((explanation.findings).length, 2)
        assertMatches(explanation, {diagnostics: [], failures: [], observed: 1})
    })

    it('finds the training data alone where the asset cannot be observed', async () => {
        const explanation = await explain(remapping(CLASSIFICATION), [classification([], DEM_INPUT)], () => throwError(() => new Error('Earth Engine unreachable')))

        assert.deepEqual(explanation.findings.map(({code}) => code), ['NO_TRAINING_DATA'])
        assert.deepEqual(explanation.failures.map(({message}) => message), ['Earth Engine unreachable'])
        assert.equal(explanation.observed, 0)
    })

    it('observes nothing where it can run', async () => {
        const observed = []

        const explanation = await explain(remapping(CLASSIFICATION), [classification(TRAINING_POINTS, DEM_INPUT)], request => {
            observed.push(request.reference)
            return of([])
        })

        assert.deepEqual(observed, [])
        assert.deepEqual(explanation.findings, [])
    })
})

describe('a Masking without a mask', () => {
    it('is described by its image, and cannot run, refused at the mask it does not select', () => {
        const recipe = masking({image: MOSAIC})

        const result = read(recipe, [MOSAIC])

        assert.equal(result.status, 'READY')
        assert.deepEqual(result.readiness.findings, [{code: 'MISSING_ROLE', path: ['model', 'imageMask'], recipePath: [recipe.id]}])
    })
})

describe('a Class Change without a legend for an image', () => {
    for (const [_case, legends, keys] of [
        ['its from image', {from: []}, ['fromImage']],
        ['its to image', {to: null}, ['toImage']],
        ['either image', {from: [], to: []}, ['fromImage', 'toImage']]
    ]) {
        it(format('is described, and cannot run, refused at the legend of %s', _case), () => {
            const recipe = classChange(legends)

            const result = read(recipe, [classification(TRAINING_POINTS), MOSAIC])

            assert.equal(result.status, 'READY')
            assert.deepEqual(result.readiness.findings, keys.map(key =>
                ({code: 'MISSING_LEGEND', path: ['model', key, 'legendEntries'], recipePath: [recipe.id]})))
        })
    }

    it('keeps a Masking of it from running, until both legends are configured', () => {
        const recipe = masking({image: CLASS_CHANGE, mask: MOSAIC})

        const missing = read(recipe, [classChange({to: []}), classification(TRAINING_POINTS), MOSAIC])
        const repaired = read(recipe, [classChange(), classification(TRAINING_POINTS), MOSAIC])

        assert.deepEqual(missing.readiness.findings, [
            {code: 'MISSING_LEGEND', path: ['model', 'toImage', 'legendEntries'], recipePath: [recipe.id, CLASS_CHANGE]}
        ])
        assert.equal(repaired.readiness.status, 'READY')
    })
})

describe('a PyEO Alerts missing what its Sources configure', () => {
    for (const [_case, sources, findings] of [
        ['no classification', {classification: undefined}, [{code: 'MISSING_ROLE', path: ['model', 'sources', 'classification']}]],
        ['no class to detect change from', {changeFromClasses: []}, [{code: 'NO_CHANGE_CLASSES', path: ['model', 'sources', 'changeFromClasses']}]],
        ['no class to detect change to', {changeToClasses: undefined}, [{code: 'NO_CHANGE_CLASSES', path: ['model', 'sources', 'changeToClasses']}]]
    ]) {
        it(format('is described, and cannot run, with %s', _case), () => {
            const recipe = pyeoAlerts(sources)

            const result = read(recipe, [classification(TRAINING_POINTS), MOSAIC])

            assert.equal(result.status, 'READY')
            assert.deepEqual(result.readiness.findings, findings.map(finding => ({...finding, recipePath: [recipe.id]})))
        })
    }

    it('keeps a Masking of it from running, until its Sources are configured', () => {
        const recipe = masking({image: PYEO_ALERTS, mask: MOSAIC})

        const missing = read(recipe, [pyeoAlerts({changeToClasses: []}), classification(TRAINING_POINTS), MOSAIC])
        const repaired = read(recipe, [pyeoAlerts(), classification(TRAINING_POINTS), MOSAIC])

        assert.deepEqual(missing.readiness.findings, [
            {code: 'NO_CHANGE_CLASSES', path: ['model', 'sources', 'changeToClasses'], recipePath: [recipe.id, PYEO_ALERTS]}
        ])
        assert.equal(repaired.readiness.status, 'READY')
    })
})

// PyEO classifies every monitoring scene with the Classification's classifier, so the scenes must carry the features its
// input's band sets include; an enabled index-drop gate needs its index from that input and from the scenes too.
// Execution reads PyEO's baseline of the Classification's one input image, gate or no gate.
describe('a PyEO Alerts whose Classification has more than one input image', () => {
    for (const [_case, gate] of [['its gate off', undefined], ['its gate on', {index: 'ndvi', threshold: 0.2}]]) {
        it(format('cannot run, %s, refused at the classification alone, nothing else of the classification judged', _case), () => {
            const recipe = monitoring({dataSets: {LANDSAT: ['LANDSAT_9']}, gate})

            const result = read(recipe, [withInputs(opticalInput(OPTICAL_FEATURES), RADAR_INPUT), MOSAIC])

            assert.deepEqual(result.readiness.findings.map(({code, path, count}) => [code, path.at(-1), count]), [
                ['MULTIPLE_CLASSIFICATION_INPUTS', 'classification', 2]
            ])
        })
    }

    it('is judged nothing of its inputs while the classification is not held', () => {
        const recipe = monitoring({dataSets: {LANDSAT: ['LANDSAT_9']}})

        const result = read(recipe, [MOSAIC])

        assert.deepEqual(result.readiness.findings, [])
        assert.deepEqual(result.readiness.needs.records, [CLASSIFICATION])
    })
})

describe('a PyEO Alerts whose monitoring data cannot feed its classifier', () => {
    it('cannot run, refused at the classification where no supported monitoring data could, its gate pending', () => {
        const recipe = monitoring({dataSets: {LANDSAT: ['LANDSAT_9']}, gate: NDVI_GATE})

        const result = read(recipe, [classification(TRAINING_POINTS, RADAR_INPUT), MOSAIC])

        assert.equal(result.status, 'READY')
        assert.deepEqual(result.readiness.findings, [{
            code: 'UNSUPPLIED_CLASSIFIER_INPUTS', path: ['model', 'sources', 'classification'],
            missing: RADAR_FEATURES, recipePath: [recipe.id]
        }])
        assert.deepEqual(result.readiness.needs.observations, [{type: 'ASSET', id: RADAR}])
    })

    // The analysis cannot run whatever the gate reads: there is nothing to gate until the classification is repaired.
    it('is refused at the classification alone once the radar input is observed without the bands any index needs', () => {
        const recipe = monitoring({dataSets: {LANDSAT: ['LANDSAT_9']}, gate: NDVI_GATE})

        const result = read(recipe, [classification(TRAINING_POINTS, RADAR_INPUT), MOSAIC], {[RADAR]: RADAR_FEATURES})

        assert.deepEqual(result.readiness.findings.map(({code, path}) => [code, path.at(-1)]), [
            ['UNSUPPLIED_CLASSIFIER_INPUTS', 'classification']
        ])
    })

    // The input is observed all the same: the baseline is the classification's own image, which needs it.
    it('asks nothing of the input\'s index for a gate that is off, though it observes the input for its baseline', () => {
        const recipe = monitoring({dataSets: {LANDSAT: ['LANDSAT_9']}})
        const records = [classification(TRAINING_POINTS, RADAR_INPUT), MOSAIC]

        const unobserved = read(recipe, records)
        const observed = read(recipe, records, {[RADAR]: ['VV']})

        assert.deepEqual(unobserved.readiness.needs.observations, [{type: 'ASSET', id: RADAR}])
        assert.deepEqual(observed.readiness.findings.map(({code, recipePath}) => [code, recipePath]), [
            ['UNSUPPLIED_CLASSIFIER_INPUTS', [recipe.id]],
            ['MISSING_INPUT_BAND', [recipe.id, CLASSIFICATION]],
            ['MISSING_INPUT_BAND', [recipe.id, CLASSIFICATION]]
        ])
    })

    it('is refused at the data sets where other supported monitoring data could feed it', () => {
        const recipe = monitoring({dataSets: {LANDSAT: ['LANDSAT_9']}})

        const result = read(recipe, [classification(TRAINING_POINTS, opticalInput(['red', 'nir', 'redEdge1'])), MOSAIC])

        assert.deepEqual(result.readiness.findings, [{
            code: 'UNSUPPLIED_CLASSIFIER_INPUTS', path: ['model', 'sources', 'dataSets'], missing: ['redEdge1'], recipePath: [recipe.id]
        }])
    })

    it('is refused at the gate\'s index where the monitoring data cannot compute it', () => {
        const recipe = monitoring({dataSets: {SENTINEL_2: ['SENTINEL_2']}, gate: {index: 'ebbi', threshold: 0.2}})

        const result = read(recipe, [classification(TRAINING_POINTS, opticalInput(OPTICAL_FEATURES)), MOSAIC], {[OPTICAL]: OPTICAL_FEATURES})

        assert.deepEqual(result.readiness.findings.map(({code, source}) => [code, source]), [
            ['UNAVAILABLE_GATE_INDEX', 'MONITORING'], ['UNAVAILABLE_GATE_INDEX', 'BASELINE']
        ])
    })

    it('asks a recipe input for the gate\'s index by name, which an optical mosaic supplies', () => {
        const recipe = monitoring({dataSets: {LANDSAT: ['LANDSAT_9']}, gate: NDVI_GATE})

        const result = read(recipe, [classification(TRAINING_POINTS, mosaicInput(SENTINEL_MOSAIC)), SENTINEL_MOSAIC])

        assert.deepEqual(result.readiness, {status: 'READY', findings: [], needs: {records: [], observations: []}})
    })

    it('is refused at the gate\'s index where the recipe input cannot supply it, though the scenes compute it', () => {
        const recipe = monitoring({dataSets: {LANDSAT: ['LANDSAT_9']}, gate: {index: 'ebbi', threshold: 0.2}})

        const result = read(recipe, [classification(TRAINING_POINTS, mosaicInput(SENTINEL_MOSAIC)), SENTINEL_MOSAIC])

        assert.deepEqual(result.readiness.findings.map(({code, source}) => [code, source]), [['UNAVAILABLE_GATE_INDEX', 'BASELINE']])
    })

    for (const [_case, included, index, alternatives] of [
        ['the other indexes both can supply', ['red', 'nir'], 'nbr', ['ndvi']],
        ['none, over a classification the scenes feed whose input supplies no index the gate offers', ['red', 'green', 'blue'], 'ndvi', []]
    ]) {
        it(format('names as the gate\'s alternatives %s', _case), () => {
            const recipe = monitoring({dataSets: {LANDSAT: ['LANDSAT_9']}, gate: {index, threshold: 0.2}})

            const result = read(recipe, [classification(TRAINING_POINTS, opticalInput(included)), MOSAIC], {[OPTICAL]: included})

            assert.deepEqual(result.readiness.findings.map(({code, path, source, alternatives}) => [code, path.at(-1), source, alternatives]), [
                ['UNAVAILABLE_GATE_INDEX', 'index', 'BASELINE', alternatives]
            ])
        })
    }

    // Settled through the observer: the input not held at first is observed as any is, and only then judged. (A recipe
    // already refused definitively observes nothing more, as the settled reads above show.)
    for (const [_case, bands, findings] of [
        ['refuses the gate, and the classification\'s band, once it answers without the index\'s bands', ['red', 'green'],
            [['UNAVAILABLE_GATE_INDEX', 'BASELINE'], ['MISSING_INPUT_BAND', undefined]]],
        ['can run once it answers with them', ['red', 'nir'], []]
    ]) {
        it(format('observes an asset input it does not hold, and %s', _case), async () => {
            const recipe = monitoring({dataSets: {LANDSAT: ['LANDSAT_9']}, gate: NDVI_GATE})
            const observed = []

            const result = await settle(recipe, [classification(TRAINING_POINTS, opticalInput(['red', 'nir'])), MOSAIC], request => {
                observed.push(request.reference)
                return of(bands.map(name => ({name, arrayDimensions: 0})))
            })

            assert.deepEqual(observed, [{type: 'ASSET', id: OPTICAL}])
            assert.deepEqual(result.readiness.findings.map(({code, source}) => [code, source]), findings)
        })
    }

    it('can run over optical inputs the monitoring data supplies, the gate\'s index computed from both', () => {
        const recipe = monitoring({dataSets: {LANDSAT: ['LANDSAT_9']}, gate: NDVI_GATE})

        const result = read(recipe, [classification(TRAINING_POINTS, opticalInput(['red', 'nir', 'swir1', 'ndvi'])), MOSAIC], {[OPTICAL]: OPTICAL_FEATURES})

        assert.deepEqual(result.readiness, {status: 'READY', findings: [], needs: {records: [], observations: []}})
    })
})

// CCDC, Time Series and Phenology classify each image of their collection with a Classification they may select, so the
// images must carry what its classifier reads where it runs: an optical scene's bands, tasseled cap and indexes, a
// radar scene's polarisations and orbit, a Planet image's bands - and whatever index the classifier computes from them.
for (const type of ['TIME_SERIES', 'CCDC', 'PHENOLOGY']) {
    describe(format('a %s', type), () => {
        it('selecting no classification is judged for none', () => {
            const recipe = collectionRecipe(type, {dataSets: {LANDSAT: ['LANDSAT_9']}})

            assert.deepEqual(read(recipe, [MOSAIC]).readiness.findings, [])
        })

        it('can run over optical scenes carrying what its classification reads', () => {
            const recipe = collectionRecipe(type, {dataSets: {LANDSAT: ['LANDSAT_9']}, classification: CLASSIFICATION})

            const result = read(recipe, [classification(TRAINING_POINTS, opticalInput(['red', 'nir', 'ndvi', 'brightness'])), MOSAIC])

            assert.deepEqual(result.readiness.findings, [])
        })

        for (const [_case, dataSets, included, field, missing] of [
            ['radar statistics over optical scenes, which no supported collection carries', {LANDSAT: ['LANDSAT_9']}, ['VV_mean', 'VH_med'], 'classification', ['VV_mean', 'VH_med']],
            ['radar polarisations over optical scenes, which a radar collection carries', {LANDSAT: ['LANDSAT_9']}, ['VV', 'VH'], 'dataSets', ['VV', 'VH']],
            ['optical bands over radar scenes, which optical scenes carry', {SENTINEL_1: ['SENTINEL_1']}, ['red', 'nir', 'ndvi'], 'dataSets', ['red', 'nir', 'ndvi']],
            ['a band no Planet basemap carries, which optical scenes do', {PLANET: ['BASEMAPS']}, ['red', 'swir1'], 'dataSets', ['swir1']]
        ]) {
            it(format('cannot run with a classification reading %s', _case), () => {
                const recipe = collectionRecipe(type, {dataSets, classification: CLASSIFICATION})

                const result = read(recipe, [classification(TRAINING_POINTS, opticalInput(included)), MOSAIC])

                assert.deepEqual(result.readiness.findings, [
                    {code: 'UNSUPPLIED_CLASSIFIER_INPUTS', path: ['model', 'sources', field], missing, recipePath: [recipe.id]}
                ])
            })
        }

        it('can run over Planet bands, and an index the classifier computes from them', () => {
            const recipe = collectionRecipe(type, {dataSets: {PLANET: ['BASEMAPS']}, classification: CLASSIFICATION})

            assert.deepEqual(read(recipe, [classification(TRAINING_POINTS, opticalInput(['red', 'nir', 'ndvi'])), MOSAIC]).readiness.findings, [])
        })

        // The Planet collection adds brightness and the date bands to every image before it is classified.
        it('can run over the brightness and date bands every Planet image is given', () => {
            const recipe = collectionRecipe(type, {dataSets: {PLANET: ['BASEMAPS']}, classification: CLASSIFICATION})

            assert.deepEqual(read(recipe, [classification(TRAINING_POINTS, opticalInput(['red', 'brightness', 'dayOfYear'])), MOSAIC]).readiness.findings, [])
        })

        it('still refuses beside them a band no Planet image carries', () => {
            const recipe = collectionRecipe(type, {dataSets: {PLANET: ['BASEMAPS']}, classification: CLASSIFICATION})

            assert.deepEqual(read(recipe, [classification(TRAINING_POINTS, opticalInput(['brightness', 'dayOfYear', 'thermal'])), MOSAIC]).readiness.findings, [{code: 'UNSUPPLIED_CLASSIFIER_INPUTS', path: ['model', 'sources', 'dataSets'], missing: ['thermal'], recipePath: [COLLECTION_RECIPE]}])
        })

        // Which Planet Daily imagery contributes is not known here: a band only eight-band imagery carries is not refused.
        it('refuses no band some Planet Daily imagery carries', () => {
            const recipe = collectionRecipe(type, {dataSets: {PLANET: ['DAILY']}, classification: CLASSIFICATION})

            assert.deepEqual(read(recipe, [classification(TRAINING_POINTS, opticalInput(['red', 'redEdge'])), MOSAIC]).readiness.findings, [])
        })

        it('keeps a Masking of it from running while its classification cannot be fed', () => {
            const recipe = masking({image: COLLECTION_RECIPE, mask: MOSAIC})
            const over = collectionRecipe(type, {dataSets: {LANDSAT: ['LANDSAT_9']}, classification: CLASSIFICATION})

            const result = read(recipe, [over, classification(TRAINING_POINTS, opticalInput(RADAR_FEATURES)), MOSAIC])

            assert.deepEqual(result.readiness.findings.map(({code, recipePath}) => [code, recipePath]), [
                ['UNSUPPLIED_CLASSIFIER_INPUTS', [recipe.id, COLLECTION_RECIPE]]
            ])
        })
    })
}

describe('an edge whose role its type does not classify', () => {
    it('cannot run, found at that edge', () => {
        const recipe = remapping(CLASSIFICATION)
        const unclassified = definition => definition.type === 'REMAPPING' ? {...definition, executionNeeds: {IMAGE_OUTPUT: {}}} : definition

        const result = read(recipe, [classification(TRAINING_POINTS), MOSAIC], {}, unclassified)

        assert.deepEqual(result.readiness.findings, [{
            code: 'UNCLASSIFIED_ROLE', role: 'INPUT_IMAGE', path: ['model', 'inputImagery', 'images', 0], recipePath: [recipe.id]
        }])
    })
})

const CLASSIFICATION = 'classification-1'
const REMAPPING = 'remapping-1'
const DEM = 'users/x/dem'

const MOSAIC = {
    id: 'mosaic-1',
    type: 'MOSAIC',
    model: {sources: {dataSets: {LANDSAT: ['LANDSAT_8']}, cloudPercentageThreshold: 100}, compositeOptions: {corrections: ['SR'], compose: 'MEDIAN'}}
}

const point = (x, y, value) => ({x, y, class: value})

const TRAINING_POINTS = [point(1, 1, 1), point(1, 2, 1), point(2, 1, 2), point(2, 2, 2)]

const MOSAIC_INPUT = {imageId: 'i-1', type: 'RECIPE_REF', id: MOSAIC.id, bandSetSpecs: [{id: 'b', type: 'IMAGE_BANDS', included: ['red', 'nir']}]}

const DEM_INPUT = {imageId: 'i-1', type: 'ASSET', id: DEM, bandSetSpecs: [{id: 'b', type: 'IMAGE_BANDS', included: ['elevation']}]}

const classification = (referenceData = [], input = MOSAIC_INPUT) => ({
    id: CLASSIFICATION,
    type: 'CLASSIFICATION',
    model: {
        inputImagery: {images: [input]},
        legend: {entries: [{value: 1}, {value: 2}]},
        trainingData: {dataSets: [{type: 'COLLECTED', referenceData}]},
        classifier: {type: 'RANDOM_FOREST'}
    }
})

const stack = id => ({
    id: 'stack-1',
    type: 'STACK',
    model: {
        inputImagery: {images: [{imageId: 's-1', type: 'RECIPE_REF', id}]},
        bandNames: {bandNames: [{imageId: 's-1', bands: [{originalName: 'class', outputName: 'class'}]}]}
    }
})

const remapping = id => ({
    id: REMAPPING,
    type: 'REMAPPING',
    model: {
        inputImagery: {images: [{imageId: 'r-1', type: 'RECIPE_REF', id, includedBands: [{band: 'class'}]}]},
        legend: {entries: [{value: 1, constraints: [{image: 'r-1', band: 'class', operator: '=', value: 1}]}]}
    }
})

const COLLECTION_RECIPE = 'collection-recipe-1'

// A recipe reading a collection configured in its Sources, corrected to surface reflectance.
const collectionRecipe = (type, sources) => ({
    id: COLLECTION_RECIPE,
    type,
    model: {
        aoi: {type: 'POLYGON', path: [[0, 0], [0, 1], [1, 1]]},
        dates: {startDate: '2020-01-01', endDate: '2021-01-01', fromYear: 2020, toYear: 2020},
        sources: {band: 'ndvi', ...sources},
        options: {corrections: ['SR']}
    }
})

const PYEO_ALERTS = 'pyeo-alerts-1'
const RADAR = 'users/x/radar'
const OPTICAL = 'users/x/optical'
const RADAR_FEATURES = ['VV_mean', 'VH_med']
const OPTICAL_FEATURES = ['blue', 'green', 'red', 'nir', 'swir1', 'swir2']
const NDVI_GATE = {index: 'ndvi', threshold: 0.2}
const RADAR_INPUT = {imageId: 'i-1', type: 'ASSET', id: RADAR, bandSetSpecs: [{id: 'b', type: 'IMAGE_BANDS', included: RADAR_FEATURES}]}
const opticalInput = included => ({imageId: 'i-1', type: 'ASSET', id: OPTICAL, bandSetSpecs: [{id: 'b', type: 'IMAGE_BANDS', included}]})
const SENTINEL_MOSAIC = {
    id: 'sentinel-mosaic-1',
    type: 'MOSAIC',
    model: {sources: {dataSets: {SENTINEL_2: ['SENTINEL_2']}, cloudPercentageThreshold: 100}, compositeOptions: {corrections: ['SR'], compose: 'MEDIAN'}}
}
const mosaicInput = mosaic => ({imageId: 'i-1', type: 'RECIPE_REF', id: mosaic.id, bandSetSpecs: [{id: 'b', type: 'IMAGE_BANDS', included: ['red', 'nir']}]})

// The Classification trained on points over every input given, the second and later as further images.
const withInputs = (...inputs) => {
    const record = classification(TRAINING_POINTS, inputs[0])
    return {...record, model: {...record.model, inputImagery: {images: inputs.map((input, i) => ({...input, imageId: `i-${i + 1}`}))}}}
}

// Monitoring with the given data sets, corrected to surface reflectance, its gate as given.
const monitoring = ({dataSets, gate}) => ({
    id: PYEO_ALERTS,
    type: 'PYEO_ALERTS',
    model: {
        sources: {classification: CLASSIFICATION, dataSets, changeFromClasses: [1], changeToClasses: [2]},
        options: {corrections: ['SR']},
        pyeoAlertsOptions: {minConsecutiveDetections: 2, ...(gate && {indexGate: gate})}
    }
})

const pyeoAlerts = sources => ({
    id: PYEO_ALERTS,
    type: 'PYEO_ALERTS',
    model: {sources: {classification: CLASSIFICATION, changeFromClasses: [1], changeToClasses: [2], ...sources}}
})

const CLASS_CHANGE = 'class-change-1'

const classChange = ({from = [{value: 1}, {value: 2}], to = [{value: 1}, {value: 2}]} = {}) => ({
    id: CLASS_CHANGE,
    type: 'CLASS_CHANGE',
    model: {
        fromImage: {type: 'RECIPE_REF', id: CLASSIFICATION, band: 'class', legendEntries: from},
        toImage: {type: 'RECIPE_REF', id: CLASSIFICATION, band: 'class', legendEntries: to}
    }
})

const masking = ({image, mask}) => ({
    id: 'masking-1',
    type: 'MASKING',
    model: {
        imageToMask: {type: 'RECIPE_REF', id: image.id || image},
        ...(mask && {imageMask: {type: 'RECIPE_REF', id: mask.id || mask}})
    }
})

const graphOf = (root, records) => buildRecipeDependencyGraph({
    rootRecipe: root,
    recipesById: new Map([root, ...records].map(recipe => [recipe.id, recipe]))
})

const declarationFor = ({type}) => recipeType(type)?.imageOutput

// What the session holds: the bands held for each asset, and each type's definition, as `adapt` changes it.
const read = (root, records, bandsByAsset = {}, adapt = definition => definition) => readImageOutput({
    graph: graphOf(root, records),
    declarationFor,
    readinessFor: ({type}) => adapt(recipeType(type)),
    observationFor: ({type, id}) => type === 'ASSET' && bandsByAsset[id]
        ? {bands: bandsByAsset[id].map(name => ({name, dataType: {arrayDimensions: 0}})), evidence: []}
        : undefined
})

// Settled through the observer, Earth Engine answering each observation as `observeBands$` says.
const settle = (root, records, observeBands$) => firstValueFrom(settledImageOutput$({
    graph: graphOf(root, records),
    observeBands$,
    declarationFor,
    readinessFor: ({type}) => recipeType(type)
}))

// Explained through the observer's single pass, Earth Engine answering each observation as `observeBands$` says.
const explain = (root, records, observeBands$) => firstValueFrom(explainImageOutput$({
    graph: graphOf(root, records),
    observeBands$,
    declarationFor,
    readinessFor: ({type}) => recipeType(type)
}))
