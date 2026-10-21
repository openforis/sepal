import assert from 'node:assert/strict'
import {beforeEach, describe, it} from 'node:test'

import {firstValueFrom} from 'rxjs'

import {
    classificationOf,
    collected,
    IMAGERY,
    input,
    MINIMUM_DISTANCE,
    model,
    RANDOM_FOREST,
    resetState,
    state,
    STATISTICS,
    SVM
} from './numericEarthEngine.js'

// A Classification reusing another recipe's training data trains on that recipe's samples (getSamples$): its points
// sampled over its raw features, after the samples it reuses in turn. Where the Classification normalises, it scales
// the samples it reuses by its own statistics, as it scales its own imagery, so each is scaled once, by the range the
// classifier is later applied with. Reused samples come first, in configured order, then its own. Earth Engine is the
// numeric stand-in of numericEarthEngine.js; the rows trained on are compared whole and in order.

// Scaled by STATISTICS, the consumer's, red to [0, 0.5, 1, 2] and nir to [0, 0.25, 1, 2]; by its own range, red to
// [0, 0.25, 0.5, 1] and nir to [0, 0.125, 0.5, 1].
const PROVIDER_IMAGERY = {red: [100, 300, 500, 900], nir: [1000, 3000, 9000, 17000]}
const PROVIDER_SCALED = {red: [0, 0.5, 1, 2], nir: [0, 0.25, 1, 2]}
const OWN_SCALED = {red: [0, 0.25, 0.5, 1], nir: [0, 0.125, 0.5, 1]}

describe('a normalising Classification reusing training data', () => {
    for (const [name, classifier] of [['SVM', SVM], ['RANDOM_FOREST', RANDOM_FOREST]]) {
        it(`trains on the raw samples of a ${name} recipe scaled by its own statistics, then on its own`, async () => {
            await reusable('provider', PROVIDER_IMAGERY, {classifier})
            const recipe = await consumer({classifier: SVM, dataSets: [reused('provider'), collected()]})

            await firstValueFrom(recipe.getImage$())

            assert.deepEqual(state.trained[0].rows, [...rows(PROVIDER_SCALED), ...rows(OWN_SCALED)])
            assert.deepEqual({...state.trained[0].statistics}, STATISTICS)
        })
    }

    it('scales samples reused through a recipe storing no points once, by its own statistics', async () => {
        await reusable('nested', PROVIDER_IMAGERY, {classifier: SVM})
        await reusable('middle', {red: [0, 10, 20, 40], nir: [0, 10, 20, 40]}, {classifier: SVM, dataSets: [reused('nested')]})
        const recipe = await consumer({classifier: SVM, dataSets: [reused('middle'), collected()]})

        await firstValueFrom(recipe.getImage$())

        assert.deepEqual(state.trained[0].rows, [...rows(PROVIDER_SCALED), ...rows(OWN_SCALED)])
    })

    it('trains on no samples of a reused recipe storing no points', async () => {
        await reusable('empty', {red: [7, 7, 7, 7], nir: [7, 7, 7, 7]}, {dataSets: []})
        await reusable('provider', PROVIDER_IMAGERY)
        const recipe = await consumer({classifier: SVM, dataSets: [reused('empty'), reused('provider'), collected()]})

        await firstValueFrom(recipe.getImage$())

        assert.deepEqual(state.trained[0].rows, [...rows(PROVIDER_SCALED), ...rows(OWN_SCALED)])
    })

    it('constructs one reduction, of its own imagery, for samples reused from normalising recipes', async () => {
        await reusable('svm', PROVIDER_IMAGERY, {classifier: SVM})
        await reusable('minimumDistance', PROVIDER_IMAGERY, {classifier: MINIMUM_DISTANCE})
        const recipe = await consumer({classifier: SVM, dataSets: [reused('svm'), reused('minimumDistance'), collected()]})

        await firstValueFrom(recipe.getImage$())

        assert.equal(state.reductions, 1)
    })

    it('leaves a reused feature it does not train on raw, and trains only on its own features', async () => {
        const bandSetSpecs = [{type: 'IMAGE_BANDS', included: ['red', 'nir', 'swir1']}]
        await reusable('provider', {...PROVIDER_IMAGERY, swir1: [4, 3, 2, 1]}, {bandSetSpecs})
        const recipe = await consumer({classifier: SVM, dataSets: [reused('provider'), collected()]})

        await firstValueFrom(recipe.getImage$())

        assert.deepEqual(state.trained[0].bandOrder, ['red', 'nir'])
        assert.deepEqual(state.trained[0].rows, [...rows({...PROVIDER_SCALED, swir1: [4, 3, 2, 1]}), ...rows(OWN_SCALED)])
    })

    describe('where its own imagery has a band constant at 0', () => {
        const redAndWater = [{type: 'IMAGE_BANDS', included: ['red', 'water']}]
        const images = [input('training', redAndWater)]
        const imagery = {training: {red: IMAGERY.red, water: [0, 0, 0, 0]}}
        const own = {red: OWN_SCALED.red, water: [0, 0, 0, 0]}

        it('scales a reused sample\'s value of that band to 0', async () => {
            await reusable('provider', {red: PROVIDER_IMAGERY.red, water: [5, 0, 7, 9]}, {bandSetSpecs: redAndWater})
            const recipe = await consumer({classifier: SVM, images, dataSets: [reused('provider'), collected()]}, imagery)

            await firstValueFrom(recipe.getImage$())

            assert.deepEqual(state.trained[0].rows, [...rows({red: PROVIDER_SCALED.red, water: [0, 0, 0, 0]}), ...rows(own)])
        })

        it('leaves a reused sample lacking that band without it', async () => {
            await reusable('provider', {red: PROVIDER_IMAGERY.red}, {bandSetSpecs: [{type: 'IMAGE_BANDS', included: ['red']}]})
            const recipe = await consumer({classifier: SVM, images, dataSets: [reused('provider'), collected()]}, imagery)

            await firstValueFrom(recipe.getImage$())

            assert.deepEqual(state.trained[0].rows, [...rows({red: PROVIDER_SCALED.red}), ...rows(own)])
        })

        it('leaves a reused sample holding null for that band null', async () => {
            await reusable('provider', {red: PROVIDER_IMAGERY.red, water: [null, 3, null, 6]}, {bandSetSpecs: redAndWater})
            const recipe = await consumer({classifier: SVM, images, dataSets: [reused('provider'), collected()]}, imagery)

            await firstValueFrom(recipe.getImage$())

            assert.deepEqual(state.trained[0].rows, [...rows({red: PROVIDER_SCALED.red, water: [null, 0, null, 0]}), ...rows(own)])
        })
    })

    it('divides a reused sample\'s value of a band constant in its own imagery by that constant', async () => {
        const bandSetSpecs = [{type: 'IMAGE_BANDS', included: ['red', 'cover']}]
        await reusable('provider', {red: PROVIDER_IMAGERY.red, cover: [25, 50, 100, 0]}, {bandSetSpecs})
        const recipe = await consumer(
            {classifier: SVM, images: [input('training', bandSetSpecs)], dataSets: [reused('provider'), collected()]},
            {training: {red: IMAGERY.red, cover: [50, 50, 50, 50]}}
        )

        await firstValueFrom(recipe.getImage$())

        assert.deepEqual(state.trained[0].rows, [
            ...rows({red: PROVIDER_SCALED.red, cover: [0.5, 1, 2, 0]}),
            ...rows({red: OWN_SCALED.red, cover: [1, 1, 1, 1]})
        ])
    })
})

describe('a Classification not normalising, reusing training data', () => {
    it('trains on the raw samples of a normalising recipe, carrying no statistics', async () => {
        await reusable('provider', PROVIDER_IMAGERY, {classifier: SVM})
        const recipe = await consumer({classifier: RANDOM_FOREST, dataSets: [reused('provider'), collected()]})

        await firstValueFrom(recipe.getImage$())

        assert.deepEqual(state.trained[0].rows, [...rows(PROVIDER_IMAGERY), ...rows(IMAGERY)])
        assert.equal(state.trained[0].statistics, undefined)
    })

    it('trains on reused samples in configured order, each recipe\'s reused before its own, then on its own', async () => {
        const sibling = {red: [11, 12, 13, 14], nir: [15, 16, 17, 18]}
        const nested = {red: [21, 22, 23, 24], nir: [25, 26, 27, 28]}
        const middle = {red: [31, 32, 33, 34], nir: [35, 36, 37, 38]}
        await reusable('sibling', sibling)
        await reusable('nested', nested)
        await reusable('middle', middle, {dataSets: [collected(), reused('nested')]})
        const recipe = await consumer({classifier: RANDOM_FOREST, dataSets: [collected(), reused('sibling'), reused('middle')]})

        await firstValueFrom(recipe.getImage$())

        assert.deepEqual(state.trained[0].rows, [...rows(sibling), ...rows(nested), ...rows(middle), ...rows(IMAGERY)])
    })
})

describe('a Classification reusing no training data', () => {
    for (const [name, classifier, trainedOn, statistics] of [
        ['SVM', SVM, OWN_SCALED, STATISTICS],
        ['RANDOM_FOREST', RANDOM_FOREST, IMAGERY, undefined]
    ]) {
        it(`${name} trains on its own points over its ${statistics ? 'scaled' : 'raw'} features`, async () => {
            const recipe = await consumer({classifier})

            await firstValueFrom(recipe.getImage$())

            assert.deepEqual(state.trained[0].rows, rows(trainedOn))
            assert.deepEqual(state.trained[0].statistics && {...state.trained[0].statistics}, statistics)
        })
    }
})

describe('the samples a Classification offers for reuse', () => {
    for (const [name, classifier] of [['SVM', SVM], ['RANDOM_FOREST', RANDOM_FOREST]]) {
        it(`of a ${name} are its points over its raw features, without band order or statistics, constructing no reduction`, async () => {
            const recipe = await classificationOf(model({classifier}))

            const samples = await firstValueFrom(recipe.getSamples$())

            assert.deepEqual(samples.items.map(({properties}) => properties), rows(IMAGERY))
            assert.equal(samples.get('band_order'), undefined)
            assert.equal(samples.get('feature_statistics'), undefined)
            assert.equal(state.reductions, 0)
        })
    }
})

// A recipe whose training data another reuses, over `imagery`, with a point at each pixel unless told otherwise.
const reusable = async (id, imagery, {classifier = SVM, dataSets = [collected()], bandSetSpecs} = {}) => {
    state.recipes[id] = await classificationOf(model({classifier, images: [input(id, bandSetSpecs)], dataSets}), {[id]: imagery})
}

// The Classification under test, classifying its own imagery as 'class' alone, so it trains once.
const consumer = (modelOptions, imagery = {training: IMAGERY}) =>
    classificationOf(model(modelOptions), imagery, {selection: ['class']})

const reused = recipe => ({type: 'RECIPE', recipe})

// A training row per point of collected(), with its class and the values of `bands` at its pixel.
const rows = bands => [1, 1, 2, 2].map((value, pixel) => ({
    class: value,
    ...Object.fromEntries(Object.entries(bands).map(([name, values]) => [name, values[pixel]]))
}))

beforeEach(resetState)
