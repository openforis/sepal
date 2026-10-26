import assert from 'node:assert/strict'
import {describe, it} from 'node:test'

import {bandSetFindings, featuresOf, featureSupply, requestedFeatures} from '#sepal/recipe/bandSets'

// What a source with given bands establishes is wrong with an input's band sets, as execution builds them: image bands
// it has or indexes derived from them, indexes derivable from them, and band combinations of at least two of its bands.
// Codes are literals.

describe('band sets judged against the bands of their source', () => {
    it('find an image band the source does not have, and accept an index under Image bands it can derive', () => {
        const findings = bandSetFindings([imageBands('red', 'ndvi', 'swir1')], ['red', 'nir'])

        assert.deepEqual(findings, [{code: 'MISSING_INPUT_BAND', path: [0, 'included', 2]}])
    })

    it('find an index the source cannot derive', () => {
        const findings = bandSetFindings([indexes('ndvi', 'ndwi')], ['red', 'nir'])

        assert.deepEqual(findings, [{code: 'UNDERIVABLE_INPUT_INDEX', path: [0, 'included', 1]}])
    })

    it('find a band combination left with fewer than two bands, and each band it lacks', () => {
        const findings = bandSetFindings([ratio('red', 'nir')], ['nir'])

        assert.deepEqual(findings, [
            {code: 'MISSING_INPUT_BAND', path: [0, 'included', 0]},
            {code: 'INSUFFICIENT_INPUT_BANDS', path: [0]}
        ])
    })

    it('find a band combination given only one band, though the source has it', () => {
        assert.deepEqual(bandSetFindings([ratio('nir')], ['red', 'nir']), [{code: 'INSUFFICIENT_INPUT_BANDS', path: [0]}])
    })

    it('find nothing in a band combination not yet given a band, nor in sets the source provides', () => {
        assert.deepEqual(bandSetFindings([imageBands('red'), ratio(), indexes('ndvi'), ratio('red', 'nir')], ['red', 'nir']), [])
    })
})

// The features a recipe requests of the training data it reuses, in the form it builds each of its input (featuresOf),
// and which of another recipe's inputs supplies each in that form (featureSupply).
describe('the features an input gives', () => {
    it('are a band it holds as provided, and an index it can calculate as calculated, overwriting a band of that name', () => {
        assert.deepEqual(featuresOf([imageBands('red', 'ndvi', 'ndmi')], [], ['red', 'nir', 'ndvi']), [
            {name: 'red', form: 'RAW'},
            {name: 'ndvi', form: 'CALCULATED'}
        ])
    })

    it('are an index it holds but cannot calculate as provided', () => {
        assert.deepEqual(featuresOf([imageBands('red', 'ndvi')], [], ['red', 'ndvi']), [
            {name: 'red', form: 'RAW'},
            {name: 'ndvi', form: 'RAW'}
        ])
    })

    it('are band combinations of its bands, named and ordered as it holds them', () => {
        assert.deepEqual(featuresOf([ratio('red', 'nir')], [], ['nir', 'red']), [
            {name: 'nir_red_ratio', form: 'COMBINED', operands: ['nir', 'red'], operation: 'RATIO'}
        ])
    })

    it('are configured covariates, overwriting a band of their name', () => {
        assert.deepEqual(featuresOf([imageBands('latitude')], ['LATITUDE'], ['latitude']), [{name: 'latitude', form: 'COVARIATE'}])
    })

    it('are a name two band sets give once, in the later\'s form', () => {
        assert.deepEqual(featuresOf([imageBands('ndvi'), indexes('ndvi')], [], ['red', 'nir', 'ndvi']), [{name: 'ndvi', form: 'CALCULATED'}])
    })

    it('are not established where a set\'s band combinations share a name', () => {
        assert.equal(featuresOf([ratio('a_b', 'c', 'a', 'b_c')], [], ['a_b', 'c', 'a', 'b_c']), null)
    })
})

describe('the features a recipe requests', () => {
    it('are each input\'s, unknown for one not described, a name two described inputs give ambiguous', () => {
        const model = recipe([image('a', imageBands('red', 'nir')), image('b', imageBands('red')), image('c', imageBands('red'))], ['LATITUDE'])

        const requested = requestedFeatures(model, [described('a', 'red', 'nir'), described('b', 'red')])

        assert.deepEqual(requested.inputs.map(features => features && features.map(({name}) => name)), [
            ['red', 'nir', 'latitude'], ['red', 'latitude'], null
        ])
        assert.deepEqual(requested.ambiguous, [{name: 'red', spellings: ['red'], inputs: [0, 1]}])
    })

    it('are ambiguous for names one input, or two, give spelled apart only by case, as each spells them', () => {
        const within = requestedFeatures(recipe([image('a', imageBands('red', 'Red'))]), [described('a', 'red', 'Red')])
        const across = requestedFeatures(recipe([image('a', imageBands('red')), image('b', imageBands('RED'))]), [described('a', 'red'), described('b', 'RED')])

        assert.deepEqual(within.ambiguous, [{name: 'red', spellings: ['red', 'Red'], inputs: [0]}])
        assert.deepEqual(across.ambiguous, [{name: 'red', spellings: ['red', 'RED'], inputs: [0, 1]}])
    })
})

describe('the features a recipe supplies', () => {
    const requesting = (bandSets, ...bands) => requestedFeatures(recipe([image('c', ...bandSets)], ['LATITUDE']), [described('c', ...bands)])
    const supplyOf = (requested, inputs, descriptions) =>
        featureSupply(requested, recipe(inputs), descriptions).map(({feature: {name}, suppliers, colliding, unknown}) => ({name, suppliers, colliding, unknown}))
    const supplying = (imageIndex, ...bands) => ({imageIndex, bands})

    it('are each requested of the one of its inputs holding it in the requested form, whatever it selects', () => {
        const requested = requesting([imageBands('red', 'nir', 'ndvi'), ratio('red', 'nir')], 'red', 'nir')

        assert.deepEqual(supplyOf(requested, [image('dem', imageBands('elevation')), image('optical', imageBands('red'))], [
            described('dem', 'elevation'), described('optical', 'nir', 'red')
        ]), [
            {name: 'red', suppliers: [supplying(1, 'red')], colliding: [], unknown: false},
            {name: 'nir', suppliers: [supplying(1, 'nir')], colliding: [], unknown: false},
            {name: 'ndvi', suppliers: [supplying(1, 'red', 'nir')], colliding: [], unknown: false},
            {name: 'red_nir_ratio', suppliers: [supplying(1, 'red', 'nir')], colliding: [], unknown: false}
        ])
    })

    it('are supplied by a band, or an operand, matching only by case, where it is the one matching', () => {
        const requested = requesting([imageBands('red', 'ndvi')], 'red', 'nir')

        assert.deepEqual(supplyOf(requested, [image('p', imageBands())], [described('p', 'RED', 'Nir')]), [
            {name: 'red', suppliers: [supplying(0, 'RED')], colliding: [], unknown: false},
            {name: 'ndvi', suppliers: [supplying(0, 'RED', 'Nir')], colliding: [], unknown: false}
        ])
    })

    it('collide where one input holds a band, or an operand, more than once whatever its case, whichever spells it as asked', () => {
        const requested = requesting([imageBands('red', 'ndvi'), ratio('red', 'nir')], 'red', 'nir')

        assert.deepEqual(supplyOf(requested, [image('p', imageBands())], [described('p', 'red', 'Red', 'nir')]), [
            {name: 'red', suppliers: [], colliding: [supplying(0, 'red', 'Red')], unknown: false},
            {name: 'ndvi', suppliers: [], colliding: [supplying(0, 'red', 'Red', 'nir')], unknown: false},
            {name: 'red_nir_ratio', suppliers: [], colliding: [supplying(0, 'red', 'Red', 'nir')], unknown: false}
        ])
    })

    it('are several inputs holding a band spelled apart only by case', () => {
        const requested = requesting([imageBands('red')], 'red')

        assert.deepEqual(supplyOf(requested, [image('a', imageBands()), image('b', imageBands())], [described('a', 'red'), described('b', 'Red')]), [
            {name: 'red', suppliers: [supplying(0, 'red'), supplying(1, 'Red')], colliding: [], unknown: false}
        ])
    })

    it('are not a calculated index from a provided one, nor a provided index from the bands it is calculated of', () => {
        const calculated = requesting([imageBands('ndvi')], 'red', 'nir')
        const provided = requesting([imageBands('ndvi')], 'ndvi')

        assert.deepEqual(supplyOf(calculated, [image('p', imageBands())], [described('p', 'ndvi')]), [{name: 'ndvi', suppliers: [], colliding: [], unknown: false}])
        assert.deepEqual(supplyOf(provided, [image('p', imageBands())], [described('p', 'red', 'nir')]), [{name: 'ndvi', suppliers: [], colliding: [], unknown: false}])
        assert.deepEqual(supplyOf(provided, [image('p', imageBands())], [described('p', 'red', 'nir', 'ndvi')]), [
            {name: 'ndvi', suppliers: [supplying(0, 'ndvi')], colliding: [], unknown: false}
        ])
    })

    it('are no combination of bands two inputs hold between them', () => {
        const requested = requesting([ratio('red', 'nir')], 'red', 'nir')

        assert.deepEqual(supplyOf(requested, [image('a', imageBands()), image('b', imageBands())], [described('a', 'red'), described('b', 'nir')]), [
            {name: 'red_nir_ratio', suppliers: [], colliding: [], unknown: false}
        ])
    })

    it('are several inputs for a name two hold, and unknown beside an input not described', () => {
        const requested = requesting([imageBands('nir')], 'nir')

        assert.deepEqual(supplyOf(requested, [image('a', imageBands()), image('b', imageBands()), image('c', imageBands())], [
            described('a', 'nir'), described('b', 'nir')
        ]), [{name: 'nir', suppliers: [supplying(0, 'nir'), supplying(1, 'nir')], colliding: [], unknown: true}])
    })

    it('are nothing established of a recipe without input images', () => {
        assert.deepEqual(supplyOf(requesting([imageBands('nir')], 'nir'), [], []), [{name: 'nir', suppliers: [], colliding: [], unknown: true}])
    })
})

const image = (id, ...bandSetSpecs) => ({imageId: id, type: 'ASSET', id, bandSetSpecs})
const recipe = (images, auxiliaryImagery = []) => ({inputImagery: {images}, auxiliaryImagery})
const described = (id, ...names) => ({description: {executionReference: {type: 'ASSET', id}, output: {bands: names.map(name => ({name}))}}})

const imageBands = (...included) => ({id: 'image-bands', type: 'IMAGE_BANDS', included})
const indexes = (...included) => ({id: 'indexes', type: 'INDEXES', included})
const ratio = (...included) => ({id: 'ratio', type: 'PAIR_WISE_EXPRESSION', operation: 'RATIO', included})
