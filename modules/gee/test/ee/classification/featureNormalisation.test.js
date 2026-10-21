import assert from 'node:assert/strict'
import {beforeEach, describe, it} from 'node:test'

import {firstValueFrom} from 'rxjs'

import {
    classificationOf,
    collected,
    image,
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

// An SVM or minimum distance Classification trains on features scaled by the per-band range of its own imagery, and
// carries that range on its training data (feature_statistics), so that a scene classified with the training data
// (classifyImage, as time-series collections and PyEO Alerts call it) is scaled as the imagery trained on. Execution
// and the auxiliary covariates are the real ones; Earth Engine is the numeric stand-in of numericEarthEngine.js.

const SCALED = [[0, 0], [0.25, 0.125], [0.5, 0.5], [1, 1]]
const RAW = [[100, 1000], [200, 2000], [300, 5000], [500, 9000]]

describe('a Classification normalising its features', () => {
    for (const [name, classifier, outputs] of [
        ['SVM', SVM, ['class', 'probability_1']],
        ['MINIMUM_DISTANCE', MINIMUM_DISTANCE, ['class']]
    ]) {
        it(`${name} classifies a scene of its own imagery on the features it trained on`, async () => {
            const recipe = await classificationOf(model({classifier}))
            const trainingData = await firstValueFrom(recipe.getTrainingData$())

            const classified = recipe.classifyImage(image(IMAGERY), outputs, trainingData)

            assert.deepEqual(state.trained.at(-1).features, SCALED)
            assert.deepEqual(state.classified.map(({features}) => features), outputs.map(() => SCALED))
            assert.deepEqual(classified.bands.class, [1, 1, 2, 2])
            if (outputs.includes('probability_1')) {
                assert.deepEqual(classified.bands.probability_1, [100, 100, 0, 0])
            }
        })

        it(`${name} scales scene values beyond the training range past 0 and 1`, async () => {
            const recipe = await classificationOf(model({classifier}))
            const trainingData = await firstValueFrom(recipe.getTrainingData$())

            recipe.classifyImage(image({red: [0, 100, 500, 900], nir: [0, 1000, 9000, 17000]}), ['class'], trainingData)

            assert.deepEqual(state.classified[0].features, [[-0.25, -0.125], [0, 0], [1, 1], [2, 2]])
        })

        it(`${name} scales only the features it trained on, leaving other scene bands raw`, async () => {
            const recipe = await classificationOf(model({classifier}))
            const trainingData = await firstValueFrom(recipe.getTrainingData$())

            recipe.classifyImage(image({...IMAGERY, cloud: [7, 7, 7, 7]}), ['class'], trainingData)

            assert.deepEqual(state.trained[0].bandOrder, ['red', 'nir'])
            assert.deepEqual(state.classified[0].features, SCALED)
            assert.deepEqual(state.classified[0].image.bands.cloud, [7, 7, 7, 7])
        })

        it(`${name} scales indexes, band combinations and auxiliary covariates each by its own range`, async () => {
            const bandSetSpecs = [
                {type: 'IMAGE_BANDS', included: ['red', 'nir', 'ndvi']},
                {type: 'PAIR_WISE_EXPRESSION', included: ['red', 'nir'], operation: 'DIFFERENCE'}
            ]
            const recipe = await classificationOf(model({classifier, images: [input('training', bandSetSpecs)], auxiliaryImagery: ['LATITUDE']}))
            const trainingData = await firstValueFrom(recipe.getTrainingData$())

            recipe.classifyImage(image(IMAGERY), ['class'], trainingData)

            const [{bandOrder, features: trained}] = state.trained
            assert.deepEqual(bandOrder, ['red', 'nir', 'ndvi', 'red_nir_difference', 'latitude'])
            assert.deepEqual(rangesOf(trained), bandOrder.map(() => [0, 1]))
            assert.deepEqual(state.classified[0].features, trained)
        })

        it(`${name} scales a constant band to 1, and a band constant at 0 to 0`, async () => {
            const constants = {red: IMAGERY.red, cover: [50, 50, 50, 50], water: [0, 0, 0, 0]}
            const images = [input('training', [{type: 'IMAGE_BANDS', included: ['red', 'cover', 'water']}])]
            const recipe = await classificationOf(model({classifier, images}), {training: constants})
            const trainingData = await firstValueFrom(recipe.getTrainingData$())

            recipe.classifyImage(image(constants), ['class'], trainingData)

            const expected = [[0, 1, 0], [0.25, 1, 0], [0.5, 1, 0], [1, 1, 0]]
            assert.deepEqual(state.trained[0].features, expected)
            assert.deepEqual(state.classified[0].features, expected)
        })

        it(`${name} carries its own statistics, not those of a recipe whose training data it reuses`, async () => {
            state.recipes.provider = await classificationOf(
                model({classifier: SVM, images: [input('provider')]}),
                {provider: {red: [0, 1000, 2000, 4000], nir: [0, 100, 200, 400]}}
            )
            const recipe = await classificationOf(model({classifier, dataSets: [{type: 'RECIPE', recipe: 'provider'}, collected()]}))
            const trainingData = await firstValueFrom(recipe.getTrainingData$())

            recipe.classifyImage(image(IMAGERY), ['class'], trainingData)

            assert.deepEqual({...trainingData.get('feature_statistics')}, STATISTICS)
            assert.deepEqual(state.classified[0].features, SCALED)
        })

        it(`${name} constructs one reduction to classify its own imagery`, async () => {
            const recipe = await classificationOf(model({classifier}), {training: IMAGERY}, {selection: ['class']})

            await firstValueFrom(recipe.getImage$())

            assert.equal(state.reductions, 1)
            assert.deepEqual(state.classified[0].features, SCALED)
        })

        for (const scenes of [1, 3]) {
            it(`${name} constructs no reduction to classify ${scenes} scene(s) with its training data`, async () => {
                const recipe = await classificationOf(model({classifier}))
                const trainingData = await firstValueFrom(recipe.getTrainingData$())

                for (let i = 0; i < scenes; i++) {
                    recipe.classifyImage(image(IMAGERY), ['class'], trainingData)
                }

                assert.equal(state.reductions, 1)
                assert.equal(state.classified.length, scenes)
            })
        }

        it(`${name} scales the imagery of several inputs once`, async () => {
            const images = [
                input('first', [{type: 'IMAGE_BANDS', included: ['red']}]),
                input('second', [{type: 'IMAGE_BANDS', included: ['nir']}])
            ]
            const imagery = {first: {red: IMAGERY.red}, second: {nir: IMAGERY.nir}}
            const recipe = await classificationOf(model({classifier, images}), imagery, {selection: ['class']})

            await firstValueFrom(recipe.getImage$())

            assert.equal(state.reductions, 1)
            assert.deepEqual(state.trained[0].features, SCALED)
            assert.deepEqual(state.classified[0].features, SCALED)
        })
    }
})

describe('a Classification not normalising its features', () => {
    for (const [name, classifier] of [
        ['SVM told not to normalise', {...SVM, normalize: 'NO'}],
        ['RANDOM_FOREST', RANDOM_FOREST]
    ]) {
        it(`${name} trains on and classifies a scene on raw features, carrying no statistics`, async () => {
            const recipe = await classificationOf(model({classifier}))
            const trainingData = await firstValueFrom(recipe.getTrainingData$())

            recipe.classifyImage(image(IMAGERY), ['class'], trainingData)

            assert.deepEqual(state.trained[0].features, RAW)
            assert.deepEqual(state.classified[0].features, RAW)
            assert.equal(trainingData.get('feature_statistics'), undefined)
            assert.equal(state.reductions, 0)
        })

        it(`${name} classifies its own imagery on raw features, constructing no reduction`, async () => {
            const recipe = await classificationOf(model({classifier}), {training: IMAGERY}, {selection: ['class']})

            await firstValueFrom(recipe.getImage$())

            assert.deepEqual(state.classified[0].features, RAW)
            assert.equal(state.reductions, 0)
        })

        it(`${name} carries no statistics of a normalising recipe whose training data it reuses`, async () => {
            state.recipes.provider = await classificationOf(model({classifier: SVM, images: [input('provider')]}), {provider: IMAGERY})
            const recipe = await classificationOf(model({classifier, dataSets: [{type: 'RECIPE', recipe: 'provider'}, collected()]}))

            const trainingData = await firstValueFrom(recipe.getTrainingData$())

            assert.equal(trainingData.get('feature_statistics'), undefined)
        })
    }
})

const rangesOf = features =>
    features[0].map((_value, band) => {
        const values = features.map(pixel => pixel[band])
        return [Math.min(...values), Math.max(...values)]
    })

beforeEach(resetState)
