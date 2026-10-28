import assert from 'node:assert/strict'
import {describe, it} from 'node:test'

import {firstValueFrom, of, throwError} from 'rxjs'

import {settledImageOutput$, settledReadiness$} from '#sepal/recipe/output/observeImageOutput'
import {readImageOutput, readReadiness} from '#sepal/recipe/output/readImageOutput'
import {recipeType} from '#sepal/recipe/recipeTypeRegistry'
import {buildRecipeDependencyGraph} from '#sepal/recipe/source/dependencyGraph'

// What a recipe classifying its collection with the Classification its Sources select needs of it: training its
// classifier and applying it to the collection's images (CLASSIFIER, lib/js/ee/src/timeSeries/collection.js) - the
// Classification's input imagery and band sets, training data, and what reuses it - found at the recipe it concerns; its
// image is never built or described for it. A Phenology needs it where its saved band is one the Classification computes;
// a band of the images reads nothing of it. A Time Series and a CCDC need it of every operation, whatever bands are asked
// or fitted - native ones too: a policy, the selected Classification being part of the analysis configured
// (collectionSources.js). A Phenology or CCDC refuses an output its Classification does not provide for its
// configuration; an output a request adds is refused by the route asking (requestedBands.js, modules/gee). Codes, roles,
// paths and types are literals.

const NATIVE_BREAKPOINTS = ['nbr']
const CLASSIFIED_BREAKPOINTS = ['nbr', 'probability_1']

for (const {type, field, value, chosen, operation, refusesUnprovided = false} of [
    {type: 'PHENOLOGY', field: 'band', value: 'probability_1', chosen: 'its band one the Classification computes', operation: 'IMAGE_OUTPUT', refusesUnprovided: true},
    ...['IMAGE_OUTPUT', 'PIXEL_OBSERVATIONS'].map(operation => ({type: 'TIME_SERIES', chosen: 'whatever is asked', operation})),
    ...['IMAGE_OUTPUT', 'COUNT', 'PIXEL_OBSERVATIONS', 'PIXEL_SEGMENTS'].flatMap(operation => [
        {type: 'CCDC', field: 'breakpointBands', value: NATIVE_BREAKPOINTS, chosen: 'its breakpoint bands native', operation},
        {
            type: 'CCDC', field: 'breakpointBands', value: CLASSIFIED_BREAKPOINTS, chosen: 'a breakpoint band one the Classification computes', operation,
            refusesUnprovided: operation !== 'PIXEL_OBSERVATIONS'
        }
    ])
]) {
    const consumer = () => consumerOf(type, field, value)
    const read = (records, {observations} = {}) => readOf(consumer(), records, operation, observations)

    describe(`a ${type} selecting a Classification, ${chosen}, for ${operation}`, () => {
        it('can run where the Classification can be trained', () => {
            assert.deepEqual(read([classification()]).readiness, READY)
        })

        it('cannot run where the Classification stores no point, refused at it', () => {
            const result = read([classification({points: []})])

            assert.deepEqual(findingsOf(result), [{code: 'NO_TRAINING_DATA', recipePath: [CONSUMER, CLASSIFICATION]}])
        })

        it('cannot run where the Classification has two input images, refused at its input imagery', () => {
            const result = read([classification({images: twoInputs(CLASSIFICATION)})], {observations: observedWithDem(CLASSIFICATION)})

            assert.deepEqual(result.readiness.findings.map(({code, path, count, recipePath}) => ({code, path, count, recipePath})), [
                {code: 'MULTIPLE_CLASSIFIER_INPUTS', path: ['model', 'inputImagery', 'images'], count: 2, recipePath: [CONSUMER, CLASSIFICATION]}
            ])
        })

        // What the Classification's own image is not refused for is said for the use alone (configurationFindings).
        it('names the use its two input images refuse alone, and none for storing no point, which refuses its image too', () => {
            const overTwo = read([classification({images: twoInputs(CLASSIFICATION)})], {observations: observedWithDem(CLASSIFICATION)})
            const untrained = read([classification({points: []})])

            assert.deepEqual([...overTwo.readiness.findings, ...untrained.readiness.findings].map(({code, operation}) => ({code, operation})), [
                {code: 'MULTIPLE_CLASSIFIER_INPUTS', operation: 'CLASSIFIER'},
                {code: 'NO_TRAINING_DATA', operation: undefined}
            ])
        })

        it('can run where the Classification reuses training data of a recipe over two input images', () => {
            const result = read([classification({reuses: [PROVIDER]}), classification({id: PROVIDER, images: twoInputs(PROVIDER)})], {
                observations: observedWithDem(CLASSIFICATION, PROVIDER)
            })

            assert.deepEqual(result.readiness.findings, [])
        })

        it('cannot run where a recipe the Classification reuses has no input imagery to sample, refused at that recipe', () => {
            const result = read([classification({reuses: [PROVIDER]}), classification({id: PROVIDER, images: []})])

            assert.deepEqual(findingsOf(result), [{code: 'MISSING_ROLE', recipePath: [CONSUMER, CLASSIFICATION, PROVIDER]}])
        })

        it('cannot run where the imagery of a recipe the Classification reuses lacks a feature it trains on, refused at it', () => {
            const result = read([classification({reuses: [PROVIDER]}), classification({id: PROVIDER, included: ['red']})], {
                observations: {[assetOf(CLASSIFICATION)]: INPUT_BANDS, [assetOf(PROVIDER)]: ['red']}
            })

            assert.deepEqual(result.readiness.findings.map(({code, provider, features, recipePath}) => ({code, provider, features, recipePath})), [
                {code: 'MISSING_TRAINING_FEATURES', provider: PROVIDER, features: ['nir'], recipePath: [CONSUMER, CLASSIFICATION]}
            ])
        })

        it('refuses a band its Classification\'s input lacks once, at the Classification, without describing its image', () => {
            const result = read([classification({included: ['red', 'swir1']})])

            assert.deepEqual(result.diagnostics, [])
            assert.deepEqual(findingsOf(result), [{code: 'MISSING_INPUT_BAND', recipePath: [CONSUMER, CLASSIFICATION]}])
        })

        it(`is refused ${refusesUnprovided ? 'only for the output' : 'for nothing, neither an output nor the training data,'} a supplied decision tree does not provide`, () => {
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

    describe(`the evidence a ${type} selecting a Classification, ${chosen}, acquires for ${operation}`, () => {
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
            const result = await settle(consumer(), [classification()], operation, ({reference: {id}}) => id === assetOf(CLASSIFICATION)
                ? throwError(() => new Error('Earth Engine unreachable'))
                : of(INPUT_BANDS.map(name => ({name, arrayDimensions: 0}))))

            assert.equal(result.readiness.status, 'UNAVAILABLE')
            assert.deepEqual(result.readiness.findings, [])
        })
    })

}

// A band of the images reads nothing of the Classification: Phenology needs nothing of it for one.
describe('a PHENOLOGY choosing a band of the images, for IMAGE_OUTPUT', () => {
    for (const [_case, records] of [
        ['stores no point', () => [classification({points: []})]],
        ['reuses a recipe without input imagery', () => [classification({reuses: [PROVIDER]}), classification({id: PROVIDER, images: []})]],
        ['reuses a recipe sampling fewer features', () => [classification({reuses: [PROVIDER]}), classification({id: PROVIDER, included: ['red']})]]
    ]) {
        it(`can run, observing nothing of it, where its Classification ${_case}`, () => {
            assert.deepEqual(readOf(consumerOf('PHENOLOGY', 'band', 'ndvi'), records(), 'IMAGE_OUTPUT', {}).readiness, READY)
        })
    }
})

// Selecting none needs nothing of any.
for (const [type, operations] of [['TIME_SERIES', ['IMAGE_OUTPUT', 'PIXEL_OBSERVATIONS']], ['CCDC', ['IMAGE_OUTPUT', 'COUNT', 'PIXEL_OBSERVATIONS', 'PIXEL_SEGMENTS']]]) {
    describe(`a ${type} selecting no Classification`, () => {
        for (const operation of operations) {
            it(`can run, observing nothing for it, for ${operation}`, () => {
                const {model: {sources: {classification: _classification, ...sources}, ...model}, ...recipe} = consumerOf(type, 'breakpointBands', NATIVE_BREAKPOINTS)

                assert.deepEqual(readOf({...recipe, model: {...model, sources}}, [], operation, {}).readiness, READY)
            })
        }
    })
}

// Change Alerts builds its reference's segments, even when its own fixed output description reads none of them.
describe('Change Alerts over a CCDC selecting a Classification', () => {
    const ccdc = () => ({...consumerOf('CCDC', 'breakpointBands', NATIVE_BREAKPOINTS), id: 'ccdc-1'})
    const alerts = () => ({id: CONSUMER, type: 'CHANGE_ALERTS', model: {
        reference: {type: 'RECIPE_REF', id: 'ccdc-1'},
        sources: {dataSetType: 'OPTICAL', dataSets: {LANDSAT: ['LANDSAT_8']}, band: 'nbr'}, options: {}
    }})
    for (const operation of ['IMAGE_OUTPUT', 'COLLECTION_MOSAIC', 'PIXEL_SEGMENTS', 'PIXEL_OBSERVATIONS']) {
        it(`blocks ${operation} for the reference's multiple-input classifier and recovers after repair`, () => {
            const broken = classification({images: twoInputs(CLASSIFICATION)})
            const read = record => readOf(alerts(), [ccdc(), record], operation, observedWithDem(CLASSIFICATION)).readiness
            const result = read(broken)
            assert.equal(result.status, 'NOT_READY')
            assert.deepEqual(result.findings.map(({code, recipePath, operation}) => ({code, recipePath, operation})), [{
                code: 'MULTIPLE_CLASSIFIER_INPUTS', recipePath: [CONSUMER, 'ccdc-1', CLASSIFICATION], operation: 'CLASSIFIER'
            }])
            assert.equal(read(classification()).status, 'READY')
        })
        it(`blocks ${operation} for missing training points in the referenced computation`, () => {
            const result = readOf(alerts(), [ccdc(), classification({points: []})], operation).readiness
            assert.equal(result.status, 'NOT_READY')
            assert.deepEqual(result.findings.map(({code, recipePath}) => ({code, recipePath})), [{
                code: 'NO_TRAINING_DATA', recipePath: [CONSUMER, 'ccdc-1', CLASSIFICATION]
            }])
        })
    }
})

const CONSUMER = 'consumer-1'
const CLASSIFICATION = 'classification-1'
const PROVIDER = 'provider-1'
const INPUT_BANDS = ['red', 'nir']
const ROOT_BANDS = ['red', 'nir', 'nbr']
const POINTS = [{x: 1, y: 1, class: 1}, {x: 2, y: 2, class: 2}]
const READY = {status: 'READY', findings: [], needs: {records: [], observations: []}}

const assetOf = id => `users/x/${id}`

// Over Landsat scenes, `value` chosen at `field` - Phenology's band, CCDC's breakpoint bands; a Time Series saves none.
const consumerOf = (type, field, value) => ({
    id: CONSUMER,
    type,
    model: {
        aoi: {type: 'POLYGON', path: [[0, 0], [0, 1], [1, 1]]},
        dates: {fromYear: 2020, toYear: 2021, startDate: '2020-01-01', endDate: '2021-01-01'},
        sources: {
            classification: CLASSIFICATION,
            dataSets: {LANDSAT: ['LANDSAT_8']},
            ...(field && type !== 'TIME_SERIES' ? {[field]: value} : {})
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

// Two input images of an asset of its own each, selecting INPUT_BANDS: the second named apart, as a Stack would.
const twoInputs = id => [
    {imageId: 'i-1', type: 'ASSET', id: assetOf(id), bandSetSpecs: [{id: 'b', type: 'IMAGE_BANDS', included: INPUT_BANDS}]},
    {imageId: 'i-2', type: 'ASSET', id: assetOf(`${id}-dem`), bandSetSpecs: [{id: 'b', type: 'IMAGE_BANDS', included: ['elevation']}]}
]

// Each asset of these recipes holding INPUT_BANDS, and their DEMs elevation.
const observedWithDem = (...ids) => Object.fromEntries(ids.flatMap(id => [[assetOf(id), INPUT_BANDS], [assetOf(`${id}-dem`), ['elevation']]]))

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
            const bands = id === root.id || type === 'RECIPE_REF' && id === 'ccdc-1'
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
