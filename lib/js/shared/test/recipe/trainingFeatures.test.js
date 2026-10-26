import assert from 'node:assert/strict'
import {describe, it} from 'node:test'

import {of, throwError} from 'rxjs'

import {settledReadiness$} from '#sepal/recipe/output/observeImageOutput'
import {readReadiness} from '#sepal/recipe/output/readImageOutput'
import {recipeType} from '#sepal/recipe/recipeTypeRegistry'
import {buildRecipeDependencyGraph} from '#sepal/recipe/source/dependencyGraph'

// Whether the samples a Classification or Regression trains on carry every feature it is trained on (trainingData.js):
// the recipe defines the named features, in the form it builds each of its own inputs (bandSets.js featuresOf), and
// each recipe storing points anywhere in a data set's reuse supplies them of its own input images, each from the one
// input supplying it in that form - whatever its own band sets select, however many inputs it has, in whatever order.
// None is MISSING_TRAINING_FEATURES, several AMBIGUOUS_TRAINING_FEATURES, found at the data set reusing it; a name two
// of the recipe's own inputs give is ambiguous there, where it reuses. What is not observed, or observed failing,
// establishes nothing. Codes, roles, paths and types are literals.

for (const type of ['CLASSIFICATION', 'REGRESSION']) {
    describe(`a ${type} reusing training data`, () => {
        it('can run where the recipe it reuses selects fewer bands than it trains on, of imagery holding them', () => {
            const readiness = read(consumerOf(type, {reuses: ['p']}), [providerOf(type, 'p', {inputs: [asset('p', ['red'])]})])

            assert.equal(readiness.status, 'READY')
        })

        it('cannot run where the imagery of the recipe it reuses lacks a feature, found at the data set reusing it', () => {
            const readiness = read(consumerOf(type, {reuses: ['p']}), [providerOf(type, 'p', {inputs: [asset(RED_ONLY, ['red'])]})])

            assert.deepEqual(findingsOf(readiness), [missing(0, 'p', ['nir'])])
        })

        it('can run once that imagery holds the feature again', () => {
            const consumer = consumerOf(type, {reuses: ['p']})

            assert.deepEqual(findingsOf(read(consumer, [providerOf(type, 'p', {inputs: [asset(RED_ONLY, ['red'])]})])), [missing(0, 'p', ['nir'])])
            assert.equal(read(consumer, [providerOf(type, 'p', {inputs: [asset('p', ['red'])]})]).status, 'READY')
        })

        it('can run reusing a recipe of other inputs, in another order, each feature in one of them', () => {
            const consumer = consumerOf(type, {reuses: ['p'], inputs: [asset(OPTICAL, ['red', 'nir']), asset(DEM, ['elevation'])]})
            const provider = providerOf(type, 'p', {inputs: [asset(DEM, ['elevation']), asset(OPTICAL, ['red'])]})

            assert.equal(read(consumer, [provider]).status, 'READY')
        })

        it('can run reusing a recipe over one Stack holding what its several inputs give', () => {
            const consumer = consumerOf(type, {reuses: ['p'], inputs: [asset(OPTICAL, ['red', 'nir']), asset(DEM, ['elevation'])]})
            const provider = providerOf(type, 'p', {inputs: [{imageId: 's', type: 'RECIPE_REF', id: STACK.id, bandSetSpecs: [bands('IMAGE_BANDS', ['red'])]}]})

            assert.equal(read(consumer, [provider, STACK]).status, 'READY')
        })

        it('cannot run where two inputs of the recipe it reuses supply a feature, found at the data set reusing it', () => {
            const provider = providerOf(type, 'p', {inputs: [asset(OPTICAL, ['red']), asset(NIR_SWIR, ['swir'])]})

            assert.deepEqual(findingsOf(read(consumerOf(type, {reuses: ['p']}), [provider])), [ambiguous(0, 'p', ['nir'])])
        })

        it('can run where two inputs of the recipe it reuses hold a band it does not train on', () => {
            const provider = providerOf(type, 'p', {inputs: [asset(OPTICAL, ['red']), asset(SWIR_ELEVATION, ['swir'])]})
            const consumer = consumerOf(type, {reuses: ['p'], inputs: [asset(OPTICAL, ['red', 'nir'])]})

            assert.equal(read(consumer, [{...provider, model: {...provider.model, inputImagery: {images: [
                asset(OPTICAL_SWIR, ['red']), asset(SWIR_ELEVATION, ['swir'])
            ]}}}]).status, 'READY')
        })

        it('cannot run where two of its own inputs give one feature, found at each, while it reuses training data', () => {
            const consumer = consumerOf(type, {reuses: ['p'], inputs: [asset(OPTICAL, ['red', 'nir']), asset(DRY_SEASON, ['red', 'nir'])]})

            assert.deepEqual(findingsOf(read(consumer, [providerOf(type, 'p')])), [
                {code: 'AMBIGUOUS_TRAINING_FEATURES', path: [...IMAGES, 0], features: ['red', 'nir'], recipePath: [CONSUMER]},
                {code: 'AMBIGUOUS_TRAINING_FEATURES', path: [...IMAGES, 1], features: ['red', 'nir'], recipePath: [CONSUMER]}
            ])
        })

        it('can run trained on its own points alone where two of its inputs give one feature', () => {
            const consumer = consumerOf(type, {points: POINTS, inputs: [asset(OPTICAL, ['red', 'nir']), asset(DRY_SEASON, ['red', 'nir'])]})

            assert.equal(read(consumer, []).status, 'READY')
        })

        it('is given a covariate configured for each of its inputs once, by the recipe it reuses whatever that is given', () => {
            const consumer = consumerOf(type, {reuses: ['p'], auxiliaryImagery: ['LATITUDE'], inputs: [asset(OPTICAL, ['red', 'nir']), asset(DEM, ['elevation'])]})

            assert.equal(read(consumer, [providerOf(type, 'p', {inputs: [asset(OPTICAL_DEM, ['red'])]})]).status, 'READY')
        })

        // Nor is such a band supplied as a covariate is: the recipe it reuses must hold it.
        it('cannot run where two of its inputs hold a band merely named as a covariate is, while it reuses training data', () => {
            const consumer = consumerOf(type, {reuses: ['p'], inputs: [asset(LATITUDE_A, ['latitude']), asset(LATITUDE_B, ['latitude'])]})

            assert.deepEqual(findingsOf(read(consumer, [providerOf(type, 'p')])).map(({code, path, features}) => ({code, path, features})), [
                {code: 'MISSING_TRAINING_FEATURES', path: [...DATA_SETS, 0], features: ['latitude']},
                {code: 'AMBIGUOUS_TRAINING_FEATURES', path: [...IMAGES, 0], features: ['latitude']},
                {code: 'AMBIGUOUS_TRAINING_FEATURES', path: [...IMAGES, 1], features: ['latitude']}
            ])
        })

        it('cannot run where the recipe it reuses can calculate an index it trains on as provided', () => {
            const consumer = consumerOf(type, {reuses: ['p'], inputs: [asset(PROVIDED_NDVI, ['red', 'ndvi'])]})

            assert.deepEqual(findingsOf(read(consumer, [providerOf(type, 'p', {inputs: [asset(OPTICAL, ['red'])]})])), [missing(0, 'p', ['ndvi'])])
        })

        it('cannot run where the recipe it reuses provides an index it trains on as calculated', () => {
            const consumer = consumerOf(type, {reuses: ['p'], inputs: [asset(OPTICAL, ['red', 'ndvi'])]})

            assert.deepEqual(findingsOf(read(consumer, [providerOf(type, 'p', {inputs: [asset(PROVIDED_NDVI, ['red'])]})])), [missing(0, 'p', ['ndvi'])])
        })

        it('can run where the recipe it reuses provides an index it trains on as provided, beside the bands it is calculated of', () => {
            const consumer = consumerOf(type, {reuses: ['p'], inputs: [asset(PROVIDED_NDVI, ['red', 'ndvi'])]})

            assert.equal(read(consumer, [providerOf(type, 'p', {inputs: [asset(PROVIDED_AND_SPECTRAL, ['red'])]})]).status, 'READY')
        })

        it('can run where the recipe it reuses calculates an index it trains on, of one input', () => {
            const consumer = consumerOf(type, {reuses: ['p'], inputs: [asset(OPTICAL, ['red', 'ndvi'])]})

            assert.equal(read(consumer, [providerOf(type, 'p', {inputs: [asset(PROVIDED_AND_SPECTRAL, ['red'])]})]).status, 'READY')
        })

        it('can run combining two bands the recipe it reuses holds in another order, named in its own', () => {
            const consumer = consumerOf(type, {reuses: ['p'], inputs: [asset(OPTICAL, [], [bands('PAIR_WISE_EXPRESSION', ['red', 'nir'], 'RATIO')])]})

            assert.equal(read(consumer, [providerOf(type, 'p', {inputs: [asset(NIR_FIRST, ['red'])]})]).status, 'READY')
        })

        it('cannot run combining two bands the recipe it reuses holds in two inputs', () => {
            const consumer = consumerOf(type, {reuses: ['p'], inputs: [asset(OPTICAL, [], [bands('PAIR_WISE_EXPRESSION', ['red', 'nir'], 'DIFFERENCE')])]})
            const provider = providerOf(type, 'p', {inputs: [asset(RED_ONLY, ['red']), asset(NIR_ONLY, ['nir'])]})

            assert.deepEqual(findingsOf(read(consumer, [provider])), [missing(0, 'p', ['red_nir_difference'])])
        })

        it('cannot run where any recipe storing points lacks a feature, whatever the others supply', () => {
            const readiness = read(consumerOf(type, {reuses: ['a', 'b']}), [
                providerOf(type, 'a', {inputs: [asset(RED_ONLY, ['red'])]}),
                providerOf(type, 'b', {inputs: [asset(NIR_ONLY, ['nir'])]})
            ])

            assert.deepEqual(findingsOf(readiness), [missing(0, 'a', ['nir']), missing(1, 'b', ['red'])])
        })

        it('cannot run where a recipe further along the reuse lacks a feature, found at the data set it is reached through', () => {
            const readiness = read(consumerOf(type, {reuses: ['p']}), [
                providerOf(type, 'p', {points: [], inputs: [asset(RED_ONLY, ['red'])], reuses: ['q']}),
                providerOf(type, 'q', {inputs: [asset(RED_ONLY, ['red'])]})
            ])

            assert.deepEqual(findingsOf(readiness), [missing(0, 'q', ['nir'])])
        })

        it('is found at each data set reusing a recipe that lacks a feature', () => {
            const readiness = read(consumerOf(type, {reuses: ['a', 'b']}), [
                providerOf(type, 'a', {points: [], reuses: ['shared']}),
                providerOf(type, 'b', {points: [], reuses: ['shared']}),
                providerOf(type, 'shared', {inputs: [asset(RED_ONLY, ['red'])]})
            ])

            assert.deepEqual(findingsOf(readiness), [missing(0, 'shared', ['nir']), missing(1, 'shared', ['nir'])])
        })

        it('can run reusing a recipe storing no point, whatever its imagery holds', () => {
            const readiness = read(consumerOf(type, {points: POINTS, reuses: ['empty']}), [
                providerOf(type, 'empty', {points: [], inputs: [asset(RED_ONLY, ['red'])]})
            ])

            assert.equal(readiness.status, 'READY')
        })

        // Trained as an input image, a recipe trains on its own definition: the reuse it is given is judged for that, and
        // what it reuses is judged for nothing of the recipe it is the input of.
        it('judges a recipe given as input imagery by its own definition, apart from the recipe it is input to', () => {
            const trainer = {...consumerOf(type, {reuses: ['p'], inputs: [asset(OPTICAL_SWIR, ['swir'])]}), id: 'trainer'}
            const consumer = consumerOf(type, {points: POINTS, inputs: [
                asset(OPTICAL, ['red', 'nir']),
                {imageId: 't', type: 'RECIPE_REF', id: 'trainer', bandSetSpecs: [bands('IMAGE_BANDS', [type === 'CLASSIFICATION' ? 'class' : 'regression'])]}
            ]})

            const readiness = read(consumer, [trainer, providerOf(type, 'p')])

            assert.deepEqual(findingsOf(readiness), [{...missing(0, 'p', ['swir']), recipePath: [CONSUMER, 'trainer']}])
        })

        it('waits, finding nothing, for its own input and that of a recipe storing points while they are not observed', () => {
            const readiness = read(consumerOf(type, {reuses: ['p']}), [providerOf(type, 'p', {inputs: [asset(RED_ONLY, ['red'])]})], {})

            assert.equal(readiness.status, 'NEEDS_EVIDENCE')
            assert.deepEqual(readiness.findings, [])
            assert.deepEqual(readiness.needs.observations.map(({id}) => id).sort(), [OPTICAL, RED_ONLY].sort())
        })

        // Unsampled, a recipe storing no point needs none of its inputs observed for what it supplies.
        it('observes nothing of its own input, nor of a recipe storing no point, where nothing it reuses stores points', () => {
            const readiness = read(consumerOf(type, {points: POINTS, reuses: ['empty']}), [providerOf(type, 'empty', {points: []})], {})

            assert.equal(readiness.status, 'READY')
            assert.deepEqual(readiness.needs.observations, [])
        })

        it('finds nothing missing while another input of the recipe it reuses is not observed', () => {
            const provider = providerOf(type, 'p', {inputs: [asset(RED_ONLY, ['red']), asset(UNOBSERVED, ['nir'])]})

            const readiness = read(consumerOf(type, {reuses: ['p']}), [provider], {...OBSERVED, [UNOBSERVED]: undefined})

            assert.equal(readiness.status, 'NEEDS_EVIDENCE')
            assert.deepEqual(readiness.findings, [])
        })

        it('finds two inputs supplying a feature ambiguous while another input is not observed', () => {
            const provider = providerOf(type, 'p', {inputs: [asset(OPTICAL, ['red']), asset(NIR_SWIR, ['swir']), asset(UNOBSERVED, ['nir'])]})

            const readiness = read(consumerOf(type, {reuses: ['p']}), [provider], {...OBSERVED, [UNOBSERVED]: undefined})

            assert.deepEqual(findingsOf(readiness), [ambiguous(0, 'p', ['nir'])])
        })

        it('finds nothing of one input supplying a feature while another is not observed, waiting for it', () => {
            const provider = providerOf(type, 'p', {inputs: [asset(OPTICAL, ['red']), asset(UNOBSERVED, ['nir'])]})

            const readiness = read(consumerOf(type, {reuses: ['p']}), [provider], {...OBSERVED, [UNOBSERVED]: undefined})

            assert.equal(readiness.status, 'NEEDS_EVIDENCE')
            assert.deepEqual(readiness.findings, [])
        })

        it('is unavailable, finding nothing, where the input of a recipe further along could not be observed', () => {
            const readiness = settled(consumerOf(type, {reuses: ['p']}), [
                providerOf(type, 'p', {points: [], reuses: ['q']}),
                providerOf(type, 'q', {inputs: [asset(RED_ONLY, ['red'])]})
            ], {[RED_ONLY]: new Error('Earth Engine unreachable')})

            assert.equal(readiness.status, 'UNAVAILABLE')
            assert.deepEqual(readiness.findings, [])
        })

        // Readiness stays conservative: every input of a recipe storing points is observed, supplying or not.
        it('is unavailable where an input of the recipe it reuses supplying nothing could not be observed', () => {
            const provider = providerOf(type, 'p', {inputs: [asset(OPTICAL, ['red']), asset(UNOBSERVED, ['swir'])]})

            const readiness = settled(consumerOf(type, {reuses: ['p']}), [provider], {[UNOBSERVED]: new Error('Earth Engine unreachable')})

            assert.equal(readiness.status, 'UNAVAILABLE')
        })

        it('is refused, finding nothing of its features, where the input of a recipe further along has no image, said there', () => {
            const nested = providerOf(type, 'q', {inputs: [{imageId: 'i-1', type: 'RECIPE_REF', id: SAMPLING_DESIGN.id, bandSetSpecs: [bands('IMAGE_BANDS', ['red'])]}]})

            const readiness = read(consumerOf(type, {reuses: ['p']}), [providerOf(type, 'p', {points: [], reuses: ['q']}), nested, SAMPLING_DESIGN])

            assert.deepEqual(readiness.findings.map(({code, recipePath}) => ({code, recipePath})), [
                {code: 'NON_IMAGE_OUTPUT', recipePath: [CONSUMER, 'p', 'q', SAMPLING_DESIGN.id]}
            ])
        })

        it('is refused at the recipe it reuses, and nothing of its features, where that recipe has no input imagery', () => {
            const readiness = read(consumerOf(type, {reuses: ['p']}), [providerOf(type, 'p', {inputs: []})])

            assert.deepEqual(readiness.findings.map(({code, recipePath}) => ({code, recipePath})), [{code: 'MISSING_ROLE', recipePath: [CONSUMER, 'p']}])
        })

        it('can run where the recipe it reuses holds a band it trains on spelled otherwise, as the one matching it', () => {
            const readiness = read(consumerOf(type, {reuses: ['p']}), [providerOf(type, 'p', {inputs: [asset(UPPER_CASE, ['RED'])]})])

            assert.equal(readiness.status, 'READY')
        })

        it('cannot run where one input of the recipe it reuses holds a band it trains on twice, by case, naming both', () => {
            const readiness = read(consumerOf(type, {reuses: ['p']}), [providerOf(type, 'p', {inputs: [asset(CASE_COLLIDING, ['red'])]})])

            assert.deepEqual(findingsOf(readiness), [ambiguous(0, 'p', ['red'])])
            assert.deepEqual(detailsOf(readiness), [{conflicts: [{feature: 'red', inputs: [{imageIndex: 0, bands: ['red', 'Red']}]}]}])
        })

        it('cannot run where two inputs of the recipe it reuses hold a band it trains on, spelled apart by case, naming both', () => {
            const provider = providerOf(type, 'p', {inputs: [asset(OPTICAL, ['red']), asset(UPPER_RED, ['RED'])]})

            const readiness = read(consumerOf(type, {reuses: ['p']}), [provider])

            assert.deepEqual(detailsOf(readiness), [{conflicts: [{feature: 'red', inputs: [{imageIndex: 0, bands: ['red']}, {imageIndex: 1, bands: ['RED']}]}]}])
        })

        it('cannot run where the bands an index it calculates is calculated of match twice in one input of the recipe it reuses', () => {
            const consumer = consumerOf(type, {reuses: ['p'], inputs: [asset(OPTICAL, ['ndvi'])]})

            const readiness = read(consumer, [providerOf(type, 'p', {inputs: [asset(CASE_COLLIDING, ['nir'])]})])

            assert.deepEqual(detailsOf(readiness), [{conflicts: [{feature: 'ndvi', inputs: [{imageIndex: 0, bands: ['red', 'Red', 'nir']}]}]}])
        })

        it('names the bands a derived feature the recipe it reuses lacks is built of', () => {
            const consumer = consumerOf(type, {reuses: ['p'], inputs: [asset(OPTICAL, ['red', 'ndvi'], [
                bands('IMAGE_BANDS', ['red', 'ndvi']), bands('PAIR_WISE_EXPRESSION', ['red', 'nir'], 'RATIO')
            ])]})

            const readiness = read(consumer, [providerOf(type, 'p', {inputs: [asset(RED_ONLY, ['red'])]})])

            assert.deepEqual(findingsOf(readiness), [missing(0, 'p', ['ndvi', 'red_nir_ratio'])])
            assert.deepEqual(detailsOf(readiness), [{requires: {ndvi: ['red', 'nir'], red_nir_ratio: ['red', 'nir']}}])
        })

        it('cannot run where two of its own inputs give a name spelled apart only by case, while it reuses training data', () => {
            const consumer = consumerOf(type, {reuses: ['p'], inputs: [asset(OPTICAL, ['red', 'nir']), asset(UPPER_RED, ['RED'])]})

            assert.deepEqual(findingsOf(read(consumer, [providerOf(type, 'p')])), [
                {code: 'AMBIGUOUS_TRAINING_FEATURES', path: [...IMAGES, 0], features: ['red'], recipePath: [CONSUMER]},
                {code: 'AMBIGUOUS_TRAINING_FEATURES', path: [...IMAGES, 1], features: ['RED'], recipePath: [CONSUMER]}
            ])
        })

        // Only an input that can supply all a feature is built of is judged for holding a band of it twice.
        it('can run where an input of the recipe it reuses that cannot supply an index holds a band of it twice', () => {
            const consumer = consumerOf(type, {reuses: ['p'], inputs: [asset(OPTICAL, ['ndvi'])]})
            const provider = providerOf(type, 'p', {inputs: [asset(OPTICAL, ['red']), asset(CASE_RED_ONLY, ['red'])]})

            assert.equal(read(consumer, [provider]).status, 'READY')
        })

        it('can run where it overwrites a band it selects with a covariate the recipe it reuses holds twice as a band', () => {
            const consumer = consumerOf(type, {reuses: ['p'], auxiliaryImagery: ['LATITUDE'], inputs: [asset(OPTICAL_LATITUDE, ['red', 'latitude'])]})

            assert.equal(read(consumer, [providerOf(type, 'p', {inputs: [asset(CASE_LATITUDE, ['red'])]})]).status, 'READY')
        })

        it('can run where it overwrites a band it selects with a combination of that name the recipe it reuses holds twice as a band', () => {
            const consumer = consumerOf(type, {reuses: ['p'], inputs: [asset(OPTICAL_DIFFERENCE, [], [
                bands('IMAGE_BANDS', ['red_nir_difference']), bands('PAIR_WISE_EXPRESSION', ['red', 'nir'], 'DIFFERENCE')
            ])]})

            assert.equal(read(consumer, [providerOf(type, 'p', {inputs: [asset(CASE_DIFFERENCE, ['red'])]})]).status, 'READY')
        })

        it('cannot run combining two bands differing only in case, found at that input, while it reuses training data', () => {
            const consumer = consumerOf(type, {reuses: ['p'], inputs: [asset(CASE_COLLIDING, [], [bands('PAIR_WISE_EXPRESSION', ['red', 'Red'], 'DIFFERENCE')])]})

            assert.deepEqual(findingsOf(read(consumer, [providerOf(type, 'p', {inputs: [asset(RED_ONLY, ['red'])]})])), [
                {code: 'AMBIGUOUS_TRAINING_FEATURES', path: [...IMAGES, 0], features: ['red_Red_difference'], recipePath: [CONSUMER]}
            ])
        })

        // Execution suffixes the second of two band combinations sharing a name (a_b with c, a with b_c), as it adds bands.
        it('establishes nothing of its own input whose band combinations share a name', () => {
            const consumer = consumerOf(type, {reuses: ['p'], inputs: [asset(COLLIDING, [], [bands('PAIR_WISE_EXPRESSION', ['a_b', 'c', 'a', 'b_c'], 'RATIO')])]})

            assert.equal(read(consumer, [providerOf(type, 'p', {inputs: [asset(RED_ONLY, ['red'])]})]).status, 'READY')
        })
    })
}

describe('a CLASSIFICATION by a supplied decision tree', () => {
    it('can run reusing a recipe whose imagery lacks a feature, as it is not trained', () => {
        const consumer = consumerOf('CLASSIFICATION', {reuses: ['p']})
        consumer.model.classifier = {type: 'DECISION_TREE'}

        assert.equal(read(consumer, [providerOf('CLASSIFICATION', 'p', {inputs: [asset(RED_ONLY, ['red'])]})]).status, 'READY')
    })
})

const CONSUMER = 'consumer-1'
const IMAGES = ['model', 'inputImagery', 'images']
const DATA_SETS = ['model', 'trainingData', 'dataSets']
const OPTICAL = 'users/x/optical'
const OPTICAL_SWIR = 'users/x/optical-swir'
const OPTICAL_DEM = 'users/x/optical-dem'
const DRY_SEASON = 'users/x/dry'
const DEM = 'users/x/dem'
const RED_ONLY = 'users/x/red'
const NIR_ONLY = 'users/x/nir'
const NIR_FIRST = 'users/x/nir-first'
const NIR_SWIR = 'users/x/nir-swir'
const SWIR_ELEVATION = 'users/x/swir-elevation'
const PROVIDED_NDVI = 'users/x/provided-ndvi'
const PROVIDED_AND_SPECTRAL = 'users/x/provided-and-spectral'
const LATITUDE_A = 'users/x/latitude-a'
const LATITUDE_B = 'users/x/latitude-b'
const COLLIDING = 'users/x/colliding'
const UNOBSERVED = 'users/x/unobserved'
const UPPER_CASE = 'users/x/upper-case'
const UPPER_RED = 'users/x/upper-red'
const CASE_COLLIDING = 'users/x/case-colliding'
const CASE_RED_ONLY = 'users/x/case-red-only'
const OPTICAL_LATITUDE = 'users/x/optical-latitude'
const CASE_LATITUDE = 'users/x/case-latitude'
const OPTICAL_DIFFERENCE = 'users/x/optical-difference'
const CASE_DIFFERENCE = 'users/x/case-difference'
const SAMPLING_DESIGN = {id: 'sampling-1', type: 'SAMPLING_DESIGN', model: {}}
const POINTS = [{x: 1, y: 1, class: 1, value: 1}, {x: 2, y: 2, class: 2, value: 2}]

const observed = (...names) => ({bands: names.map(name => ({name, dataType: {arrayDimensions: 0}})), evidence: []})

// What each asset holds; any other holds red and nir.
const OBSERVED = Object.fromEntries(Object.entries({
    [OPTICAL]: ['red', 'nir'],
    [OPTICAL_SWIR]: ['red', 'nir', 'swir'],
    [OPTICAL_DEM]: ['red', 'nir', 'elevation'],
    [DRY_SEASON]: ['red', 'nir'],
    [DEM]: ['elevation'],
    [RED_ONLY]: ['red'],
    [NIR_ONLY]: ['nir'],
    [NIR_FIRST]: ['nir', 'red'],
    [NIR_SWIR]: ['nir', 'swir'],
    [SWIR_ELEVATION]: ['swir', 'elevation'],
    [PROVIDED_NDVI]: ['red', 'ndvi'],
    [PROVIDED_AND_SPECTRAL]: ['red', 'nir', 'ndvi'],
    [LATITUDE_A]: ['latitude'],
    [LATITUDE_B]: ['latitude'],
    [COLLIDING]: ['a_b', 'c', 'a', 'b_c'],
    [UNOBSERVED]: ['red', 'nir', 'swir'],
    [UPPER_CASE]: ['RED', 'Nir'],
    [UPPER_RED]: ['RED'],
    [CASE_COLLIDING]: ['red', 'Red', 'nir'],
    [CASE_RED_ONLY]: ['red', 'Red'],
    [OPTICAL_LATITUDE]: ['red', 'nir', 'latitude'],
    [CASE_LATITUDE]: ['red', 'latitude', 'Latitude'],
    [OPTICAL_DIFFERENCE]: ['red', 'nir', 'red_nir_difference'],
    [CASE_DIFFERENCE]: ['red_nir_difference', 'RED_NIR_DIFFERENCE', 'red', 'nir']
}).map(([id, names]) => [id, observed(...names)]))

const observationOf = id => OBSERVED[id] || observed('red', 'nir')

// A Stack outputting one optical asset's red and nir and a DEM's elevation, as one image.
const STACK = {
    id: 'stack-1',
    type: 'STACK',
    model: {
        inputImagery: {images: [{imageId: 'o', type: 'ASSET', id: OPTICAL}, {imageId: 'd', type: 'ASSET', id: DEM}]},
        bandNames: {bandNames: [
            {imageId: 'o', bands: [{originalName: 'red', outputName: 'red'}, {originalName: 'nir', outputName: 'nir'}]},
            {imageId: 'd', bands: [{originalName: 'elevation', outputName: 'elevation'}]}
        ]}
    }
}

const bands = (type, included, operation) => ({id: `${type}-set`, type, included, ...(operation && {operation})})

// An input image of asset `id`, selecting `included` of it, or the band sets given.
const asset = (id, included, bandSets = [bands('IMAGE_BANDS', included)]) =>
    ({imageId: `image-${id}`, type: 'ASSET', id, bandSetSpecs: bandSets})

// A recipe of `type` over `inputs`, trained on the points it stores and the recipes it reuses.
const recipeOf = (type, id, {inputs, points, reuses, auxiliaryImagery = []}) => ({
    id,
    type,
    model: {
        inputImagery: {images: inputs},
        auxiliaryImagery,
        legend: {entries: [{value: 1}, {value: 2}]},
        classifier: {type: 'RANDOM_FOREST'},
        trainingData: {dataSets: [
            ...(points.length ? [{dataSetId: 'collected', type: 'COLLECTED', referenceData: points}] : []),
            ...reuses.map(recipe => ({dataSetId: recipe, type: 'RECIPE', recipe}))
        ]}
    }
})

// The recipe under test, trained on red and nir of one optical input unless `inputs` say otherwise.
const consumerOf = (type, {points = [], reuses = [], inputs = [asset(OPTICAL, ['red', 'nir'])], auxiliaryImagery} = {}) =>
    recipeOf(type, CONSUMER, {inputs, points, reuses, auxiliaryImagery})

// A recipe whose training data is reused, storing points of its own unless `points` says otherwise.
const providerOf = (type, id, {inputs = [asset(`users/x/${id}`, ['red', 'nir'])], points = POINTS, reuses = []} = {}) =>
    recipeOf(type, id, {inputs, points, reuses})

const missing = (index, provider, features) =>
    ({code: 'MISSING_TRAINING_FEATURES', path: ['model', 'trainingData', 'dataSets', index], provider, features, recipePath: [CONSUMER]})

const ambiguous = (index, provider, features) =>
    ({code: 'AMBIGUOUS_TRAINING_FEATURES', path: ['model', 'trainingData', 'dataSets', index], provider, features, recipePath: [CONSUMER]})

const declarationFor = ({type}) => recipeType(type)?.imageOutput

const readinessFor = ({type}) => recipeType(type)

const graphOf = (root, records) =>
    buildRecipeDependencyGraph({rootRecipe: root, recipesById: new Map([root, ...records].map(recipe => [recipe.id, recipe]))})

// Readiness from what is held now: every asset observed as it holds, or as `observations` say.
const read = (root, records, observations) => readReadiness({
    graph: graphOf(root, records),
    operation: 'IMAGE_OUTPUT',
    declarationFor,
    readinessFor,
    observationFor: ({type, id}) => type === 'ASSET' ? (observations ? observations[id] : observationOf(id)) : undefined
}).readiness

// Readiness settled through the observer, Earth Engine answering each asset as it holds, or failing as `failures` say.
const settled = (root, records, failures) => {
    const observeBands$ = ({reference: {id}}) => failures[id]
        ? throwError(() => failures[id])
        : of(observationOf(id).bands.map(({name}) => ({name, arrayDimensions: 0})))
    let readiness = null
    settledReadiness$({graph: graphOf(root, records), operation: 'IMAGE_OUTPUT', observeBands$, declarationFor, readinessFor})
        .subscribe(result => readiness = result)
    return readiness
}

// What feature findings say beyond what they name: the bands derived features are built of, the inputs in conflict.
const detailsOf = readiness => readiness.findings
    .filter(({code, provider}) => provider && ['MISSING_TRAINING_FEATURES', 'AMBIGUOUS_TRAINING_FEATURES'].includes(code))
    .map(({requires, conflicts}) => ({...(requires && Object.keys(requires).length && {requires}), ...(conflicts && {conflicts})}))
    .filter(details => Object.keys(details).length)

const findingsOf = readiness => readiness.findings
    .filter(({code}) => ['MISSING_TRAINING_FEATURES', 'AMBIGUOUS_TRAINING_FEATURES'].includes(code))
    .map(({code, path, provider, features, recipePath}) => ({code, path, ...(provider && {provider}), features, recipePath}))
