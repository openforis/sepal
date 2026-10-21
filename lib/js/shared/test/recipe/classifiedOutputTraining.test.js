import assert from 'node:assert/strict'
import {describe, it} from 'node:test'

import {firstValueFrom, of, throwError} from 'rxjs'

import {requestStages} from '#sepal/recipe/classifiedOutputs'
import {settledImageOutput$, settledReadiness$} from '#sepal/recipe/output/observeImageOutput'
import {readImageOutput, readReadiness} from '#sepal/recipe/output/readImageOutput'
import {recipeType} from '#sepal/recipe/recipeTypeRegistry'
import {buildRecipeDependencyGraph} from '#sepal/recipe/source/dependencyGraph'

// A Phenology whose saved band, or a CCDC whose saved breakpoint band, is one its Classification computes trains that
// Classification's classifier and applies it to every image of its collection (CLASSIFIER,
// lib/js/ee/src/timeSeries/collection.js) - Phenology for its image, CCDC for its image and for the segments a chart
// reads, as every segmentation fits its breakpoint bands. So does a band a request asks of a Time Series' or a CCDC's
// collection, which adds the collection classified to what it is judged by (requestStages, CLASSIFIED_COLLECTION). What
// that needs - the Classification's input imagery and band sets, training data, and what reuses it - is needed there,
// found at the recipe it concerns; its image is never built or described for it. A band of the images reads nothing of
// the Classification beyond what its classifier reads of them. A Phenology or CCDC refuses an output its Classification
// does not provide for its configuration; an output a request adds is refused by the route asking (requestedBands.js,
// modules/gee), not by this stage. Codes, roles, paths and types are literals.

for (const {type, field, chosen, operation, native = operation, operationOf = () => operation, refusesUnprovided = true} of [
    {type: 'PHENOLOGY', field: 'band', chosen: 'at its band', operation: 'IMAGE_OUTPUT'},
    {type: 'CCDC', field: 'breakpointBands', chosen: 'at its breakpointBands', operation: 'IMAGE_OUTPUT'},
    {type: 'CCDC', field: 'breakpointBands', chosen: 'at its breakpointBands', operation: 'PIXEL_SEGMENTS'},
    ...['TIME_SERIES', 'CCDC'].map(type => ({
        type,
        chosen: 'as a band a request asks of its collection',
        operation: 'CLASSIFIED_COLLECTION',
        native: 'PIXEL_OBSERVATIONS',
        operationOf: band => requestStages([band])[0] ?? 'PIXEL_OBSERVATIONS',
        refusesUnprovided: false
    }))
]) {
    const consumer = band => consumerOf(type, field, band)
    const read = (records, {band = CLASSIFIED, observations} = {}) => readOf(consumer(band), records, operationOf(band), observations)

    describe(`a ${type} choosing a band its Classification computes ${chosen}, for ${operation}`, () => {
        it('can run where the Classification can be trained', () => {
            assert.deepEqual(read([classification()]).readiness, READY)
        })

        it('cannot run where the Classification stores no point, refused at it', () => {
            const result = read([classification({points: []})])

            assert.deepEqual(findingsOf(result), [{code: 'NO_TRAINING_DATA', recipePath: [CONSUMER, CLASSIFICATION]}])
        })

        it('cannot run where a recipe the Classification reuses has no input imagery to sample, refused at that recipe', () => {
            const result = read([classification({reuses: [PROVIDER]}), classification({id: PROVIDER, images: []})])

            assert.deepEqual(findingsOf(result), [{code: 'MISSING_ROLE', recipePath: [CONSUMER, CLASSIFICATION, PROVIDER]}])
        })

        it('cannot run where a recipe the Classification reuses samples fewer features than it trains on, refused at it', () => {
            const result = read([classification({reuses: [PROVIDER]}), classification({id: PROVIDER, included: ['red']})])

            assert.deepEqual(result.readiness.findings.map(({code, provider, features, recipePath}) => ({code, provider, features, recipePath})), [
                {code: 'MISSING_TRAINING_FEATURES', provider: PROVIDER, features: ['nir'], recipePath: [CONSUMER, CLASSIFICATION]}
            ])
        })

        it('refuses a band its Classification\'s input lacks once, at the Classification, without describing its image', () => {
            const result = read([classification({included: ['red', 'swir1']})])

            assert.deepEqual(result.diagnostics, [])
            assert.deepEqual(findingsOf(result), [{code: 'MISSING_INPUT_BAND', recipePath: [CONSUMER, CLASSIFICATION]}])
        })

        it(`is refused ${refusesUnprovided ? 'only for the output' : 'for nothing, neither the output nor the training data,'} a supplied decision tree does not provide`, () => {
            const result = read([classification({points: [], classifier: 'DECISION_TREE'})])

            assert.deepEqual(result.readiness.findings.map(({code}) => code), refusesUnprovided ? ['UNSUPPORTED_CLASSIFIED_OUTPUT'] : [])
        })

        it('cannot run over a recipe that trains no classifier for other imagery', () => {
            const result = read([{...classification(), type: 'REGRESSION'}])

            assert.deepEqual(findingsOf(result).filter(({code}) => code === 'UNDECLARED_OPERATION'), [
                {code: 'UNDECLARED_OPERATION', recipePath: [CONSUMER, CLASSIFICATION]}
            ])
        })

        it('can run once the Classification stores a point', () => {
            assert.equal(read([classification({points: []})]).readiness.status, 'NOT_READY')
            assert.equal(read([classification()]).readiness.status, 'READY')
        })
    })

    describe(`the evidence a ${type} choosing a band its Classification computes ${chosen} acquires, for ${operation}`, () => {
        it('waits, finding nothing, for the input of the Classification and of the recipe it reuses', () => {
            const result = read([classification({reuses: [PROVIDER]}), classification({id: PROVIDER})], {observations: {}})

            assert.equal(result.readiness.status, 'NEEDS_EVIDENCE')
            assert.deepEqual(result.readiness.findings, [])
            assert.deepEqual(result.readiness.needs.observations.map(({id}) => id).sort(), [assetOf(CLASSIFICATION), assetOf(PROVIDER)].sort())
        })

        it('waits for the Classification while it is not held', () => {
            assert.deepEqual(read([]).readiness.needs.records, [CLASSIFICATION])
        })

        it('is unavailable, finding nothing, where the Classification\'s input could not be observed', async () => {
            const result = await settle(consumer(CLASSIFIED), [classification()], operation, ({reference: {id}}) => id === assetOf(CLASSIFICATION)
                ? throwError(() => new Error('Earth Engine unreachable'))
                : of(INPUT_BANDS.map(name => ({name, arrayDimensions: 0}))))

            assert.equal(result.readiness.status, 'UNAVAILABLE')
            assert.deepEqual(result.readiness.findings, [])
        })
    })

    describe(`a ${type} choosing a band of the images ${chosen}, for ${native}`, () => {
        for (const [_case, records] of [
            ['stores no point', () => [classification({points: []})]],
            ['reuses a recipe without input imagery', () => [classification({reuses: [PROVIDER]}), classification({id: PROVIDER, images: []})]],
            ['reuses a recipe sampling fewer features', () => [classification({reuses: [PROVIDER]}), classification({id: PROVIDER, included: ['red']})]]
        ]) {
            it(`can run, observing nothing of it, where its Classification ${_case}`, () => {
                assert.deepEqual(read(records(), {band: 'ndvi', observations: {}}).readiness, READY)
            })
        }
    })
}

const CONSUMER = 'consumer-1'
const CLASSIFICATION = 'classification-1'
const PROVIDER = 'provider-1'
const CLASSIFIED = 'probability_1'
const INPUT_BANDS = ['red', 'nir']
const ROOT_BANDS = ['red', 'nir', 'nbr']
const POINTS = [{x: 1, y: 1, class: 1}, {x: 2, y: 2, class: 2}]
const READY = {status: 'READY', findings: [], needs: {records: [], observations: []}}

const assetOf = id => `users/x/${id}`

// Over Landsat scenes, `band` chosen at `field` - alone, or as CCDC's breakpoints beside a band of the images; a Time
// Series saves none.
const consumerOf = (type, field, band) => ({
    id: CONSUMER,
    type,
    model: {
        aoi: {type: 'POLYGON', path: [[0, 0], [0, 1], [1, 1]]},
        dates: {fromYear: 2020, toYear: 2021, startDate: '2020-01-01', endDate: '2021-01-01'},
        sources: {
            classification: CLASSIFICATION,
            dataSets: {LANDSAT: ['LANDSAT_8']},
            ...(field ? {[field]: field === 'band' ? band : ['nbr', band]} : {})
        },
        options: {corrections: ['SR']},
        ccdcOptions: {dateFormat: 0}
    }
})

// A Classification over an asset of its own, selecting `included` of it, trained on its points and the recipes it reuses.
const classification = ({id = CLASSIFICATION, included = INPUT_BANDS, images, points = POINTS, reuses = [], classifier = 'RANDOM_FOREST'} = {}) => ({
    id,
    type: 'CLASSIFICATION',
    model: {
        inputImagery: {images: images ?? [{imageId: 'i-1', type: 'ASSET', id: assetOf(id), bandSetSpecs: [{id: 'b', type: 'IMAGE_BANDS', included}]}]},
        legend: {entries: [{value: 1}, {value: 2}]},
        classifier: {type: classifier},
        trainingData: {dataSets: [
            ...(points.length ? [{dataSetId: 'collected', type: 'COLLECTED', referenceData: points}] : []),
            ...reuses.map(recipe => ({dataSetId: recipe, type: 'RECIPE', recipe}))
        ]}
    }
})

const graphOf = (root, records) =>
    buildRecipeDependencyGraph({rootRecipe: root, recipesById: new Map([root, ...records].map(recipe => [recipe.id, recipe]))})

const declarationFor = ({type}) => recipeType(type)?.imageOutput

const readinessFor = ({type}) => recipeType(type)

// What the session holds: every asset observed holding INPUT_BANDS, unless `observations` says, and the recipe's own
// collection observed, as describing a CCDC's image observes it. An image is read as its output read reads it,
// describing what it builds; the segments as that operation alone is read.
const readOf = (root, records, operation, observations) => {
    const args = {
        graph: graphOf(root, records),
        declarationFor,
        readinessFor,
        observationFor: ({type, id}) => {
            const bands = id === root.id
                ? ROOT_BANDS
                : type === 'ASSET' && (observations ? observations[id] : INPUT_BANDS)
            return bands ? {bands: bands.map(name => ({name, dataType: {arrayDimensions: 0}})), evidence: []} : undefined
        }
    }
    return operation === 'IMAGE_OUTPUT' ? readImageOutput(args) : {diagnostics: [], ...readReadiness({...args, operation})}
}

// Settled through the observer, Earth Engine answering each observation as `observeBands$` says: an image as its output
// is settled, another operation as that operation alone.
const settle = (root, records, operation, observeBands$) => {
    const args = {graph: graphOf(root, records), observeBands$, declarationFor, readinessFor}
    return operation === 'IMAGE_OUTPUT'
        ? firstValueFrom(settledImageOutput$(args))
        : firstValueFrom(settledReadiness$({...args, operation})).then(readiness => ({readiness}))
}

const findingsOf = result => result.readiness.findings.map(({code, recipePath}) => ({code, recipePath}))
