import assert from 'node:assert/strict'
import {beforeEach, describe, it} from 'node:test'

import {firstValueFrom} from 'rxjs'

import {featureSupply, requestedFeatures} from '#sepal/recipe/bandSets'

import {classificationOf, collected, image, RANDOM_FOREST, resetState, state, SVM} from './numericEarthEngine.js'

// A Classification or Regression reusing training data trains on the features it defines, sampled of each reused
// recipe's own imagery at that recipe's own points and scale (lib/js/ee/src/classification/features.js): each feature
// from the one input of that recipe supplying it in the form the reusing recipe builds it - a band by name, a calculated
// index of its standard bands, a combination of both operands ordered as the reusing recipe orders them, a configured
// covariate generated - whatever that recipe selects, however many inputs it has and in whatever order. None, or
// several, fail the evaluation, readiness or not. Earth Engine is the numeric stand-in of numericEarthEngine.js; the
// rows trained on are compared whole and in order, reused before own.

const OPTICAL = {red: [120, 300, 500, 900], nir: [1200, 3000, 9000, 17000]}
const DEM = {elevation: [5, 6, 7, 8]}
const OWN = {red: [100, 200, 300, 500], nir: [1000, 2000, 5000, 9000]}
const OWN_DEM = {elevation: [1, 2, 3, 4]}

describe('a Classification reusing training data', () => {
    it('trains on the features it defines, sampled of the reused recipe\'s imagery whatever that recipe selects', async () => {
        await reusable('provider', [input('optical', selecting('red'))], {optical: OPTICAL})
        const recipe = await consumer([input('own', selecting('red', 'nir'))], {own: OWN})

        await trained(recipe)

        assert.deepEqual(state.trained[0].bandOrder, ['red', 'nir'])
        assert.deepEqual(state.trained[0].rows, [...rows(OPTICAL), ...rows(OWN)])
    })

    it('trains on its features of a recipe of other inputs in another order, each sampled of the input supplying it', async () => {
        await reusable('provider', [input('dem', selecting('elevation')), input('optical', selecting('red'))], {dem: DEM, optical: OPTICAL})
        const recipe = await consumer([input('own', selecting('red', 'nir')), input('ownDem', selecting('elevation'))], {own: OWN, ownDem: OWN_DEM})

        await trained(recipe)

        assert.deepEqual(state.trained[0].bandOrder, ['red', 'nir', 'elevation'])
        assert.deepEqual(state.trained[0].rows, [...rows({...OPTICAL, ...DEM}), ...rows({...OWN, ...OWN_DEM})])
    })

    it('trains on its features of a recipe over one Stack of what its own two inputs give', async () => {
        await reusable('provider', [input('stack', selecting('red'))], {stack: {...OPTICAL, ...DEM}})
        const recipe = await consumer([input('own', selecting('red', 'nir')), input('ownDem', selecting('elevation'))], {own: OWN, ownDem: OWN_DEM})

        await trained(recipe)

        assert.deepEqual(state.trained[0].rows, [...rows({...OPTICAL, ...DEM}), ...rows({...OWN, ...OWN_DEM})])
    })

    it('trains on its features beside a band two inputs of the reused recipe hold that it does not train on', async () => {
        const swir = [1, 2, 3, 4]
        await reusable('provider', [input('optical', selecting('red')), input('dem', selecting('elevation'))], {
            optical: {...OPTICAL, swir}, dem: {...DEM, swir}
        })
        const recipe = await consumer([input('own', selecting('red', 'nir'))], {own: OWN})

        await trained(recipe)

        assert.deepEqual(state.trained[0].rows, [...rows(OPTICAL), ...rows(OWN)])
    })

    it('trains on an index it calculates, calculated of the reused recipe\'s spectral bands, in physical units', async () => {
        await reusable('provider', [input('optical', selecting('red'))], {optical: {nir: OPTICAL.nir, red: OPTICAL.red}})
        const recipe = await consumer([input('own', selecting('red', 'ndvi'))], {own: OWN})

        await trained(recipe)

        // As the real calculator computes it, of reflectance: stored values divided by 10000.
        const ndvi = OPTICAL.red.map((red, pixel) => (OPTICAL.nir[pixel] / 1e4 - red / 1e4) / (OPTICAL.nir[pixel] / 1e4 + red / 1e4))
        assert.deepEqual(state.trained[0].rows.slice(0, 4), rows({red: OPTICAL.red, ndvi}))
        assert.ok(Math.abs(ndvi[0] - 0.818) < 0.001)
    })

    it('trains on an index provided as a band, selected as provided of a reused recipe holding it beside its spectral bands', async () => {
        await reusable('provider', [input('optical', selecting('red'))], {optical: {...OPTICAL, ndvi: [8181, 8182, 8947, 8994]}})
        const recipe = await consumer([input('own', selecting('red', 'ndvi'))], {own: {red: OWN.red, ndvi: [6000, 6100, 6200, 6300]}})

        await trained(recipe)

        assert.deepEqual(state.trained[0].rows.slice(0, 4), rows({red: OPTICAL.red, ndvi: [8181, 8182, 8947, 8994]}))
    })

    it('trains on a band combination ordered as its own input orders the bands, of a reused recipe holding them in another', async () => {
        const difference = {id: 'pairs', type: 'PAIR_WISE_EXPRESSION', included: ['red', 'nir'], operation: 'DIFFERENCE'}
        await reusable('provider', [input('optical', selecting('red'))], {optical: {nir: OPTICAL.nir, red: OPTICAL.red}})
        const recipe = await consumer([input('own', [difference])], {own: OWN})

        await trained(recipe)

        assert.deepEqual(state.trained[0].bandOrder, ['red_nir_difference'])
        assert.deepEqual(state.trained[0].rows.slice(0, 4), rows({red_nir_difference: [-1080, -2700, -8500, -16100]}))
    })

    it('trains on a covariate configured for each of its inputs, generated for the reused recipe under each name', async () => {
        await reusable('provider', [input('optical', selecting('red'))], {optical: {...OPTICAL, ...DEM}})
        const recipe = await consumer([input('own', selecting('red', 'nir')), input('ownDem', selecting('elevation'))], {own: OWN, ownDem: OWN_DEM}, {
            auxiliaryImagery: ['LATITUDE']
        })

        await trained(recipe)

        const latitude = [10, 20, 30, 50]
        assert.deepEqual(state.trained[0].bandOrder, ['red', 'nir', 'latitude', 'elevation', 'latitude_1'])
        assert.deepEqual(state.trained[0].rows.slice(0, 4), rows({...OPTICAL, latitude, elevation: DEM.elevation, latitude_1: latitude}))
    })

    it('scales a covariate of each of its inputs once, each by the range of its own column', async () => {
        await reusable('provider', [input('optical', selecting('red'))], {optical: {...OPTICAL, ...DEM}})
        const recipe = await consumer([input('own', selecting('red')), input('ownDem', selecting('elevation'))], {own: OWN, ownDem: OWN_DEM}, {
            classifier: SVM, auxiliaryImagery: ['LATITUDE']
        })

        await trained(recipe)

        const scaledLatitude = [0, 0.25, 0.5, 1]
        assert.deepEqual(state.trained[0].rows.slice(0, 4), rows({
            red: [0.05, 0.5, 1, 2], latitude: scaledLatitude, elevation: [4 / 3, 5 / 3, 2, 7 / 3], latitude_1: scaledLatitude
        }))
    })

    it('trains on a band merely named as a covariate is as a band of the reused recipe\'s imagery', async () => {
        await reusable('provider', [input('optical', selecting('red'))], {optical: {...OPTICAL, latitude: [1, 2, 3, 4]}})
        const recipe = await consumer([input('own', selecting('red', 'latitude'))], {own: {red: OWN.red, latitude: [7, 7, 7, 7]}})

        await trained(recipe)

        assert.deepEqual(state.trained[0].rows.slice(0, 4), rows({red: OPTICAL.red, latitude: [1, 2, 3, 4]}))
    })

    it('trains on the features it defines through a recipe storing no point, which samples nothing of its own', async () => {
        await reusable('nested', [input('optical', selecting('red'))], {optical: OPTICAL})
        await reusable('middle', [input('middleImagery', selecting('swir1'))], {middleImagery: {swir1: [1, 2, 3, 4]}}, {dataSets: [reused('nested')]})
        const recipe = await consumer([input('own', selecting('red', 'nir'))], {own: OWN}, {dataSets: [reused('middle'), collected()]})

        await trained(recipe)

        assert.deepEqual(state.trained[0].rows, [...rows(OPTICAL), ...rows(OWN)])
        assert.deepEqual(state.samplings.map(({bands}) => bands), [['red', 'nir'], ['red', 'nir']])
    })

    it('trains on a recipe two of its data sets reach twice, nested recipes before their own', async () => {
        const middle = {red: [31, 32, 33, 34], nir: [35, 36, 37, 38]}
        await reusable('shared', [input('optical', selecting('red'))], {optical: OPTICAL})
        await reusable('middle', [input('middleImagery', selecting('nir'))], {middleImagery: middle}, {dataSets: [collected(), reused('shared')]})
        const recipe = await consumer([input('own', selecting('red', 'nir'))], {own: OWN}, {dataSets: [reused('shared'), reused('middle'), collected()]})

        await trained(recipe)

        assert.deepEqual(state.trained[0].rows, [...rows(OPTICAL), ...rows(OPTICAL), ...rows(middle), ...rows(OWN)])
    })

    it('samples the reused recipe at its own scale, on the grid of the first feature it defines as supplied', async () => {
        await reusable('provider', [input('dem', selecting('elevation')), input('optical', selecting('red'))], {dem: DEM, optical: OPTICAL}, {scale: 20})
        const recipe = await consumer([input('own', selecting('red', 'nir')), input('ownDem', selecting('elevation'))], {own: OWN, ownDem: OWN_DEM})

        await trained(recipe)

        assert.deepEqual(state.samplings[0], {bands: ['red', 'nir', 'elevation'], scale: 20, projection: 'red', points: 4})
    })

    // Masked as Earth Engine's sampleRegions documents: a point where a feature sampled is masked is no sample.
    it('trains on no reused sample at a point where a feature it defines is masked, whatever an input supplying nothing holds', async () => {
        await reusable('provider', [input('optical', selecting('red')), input('unused', selecting('swir'))], {
            optical: {red: OPTICAL.red, nir: [1200, null, 9000, 17000]},
            unused: {swir: [null, 1, 1, null]}
        })
        const recipe = await consumer([input('own', selecting('red', 'nir'))], {own: OWN})

        await trained(recipe)

        assert.deepEqual(state.trained[0].rows.slice(0, 3), [
            {class: 1, red: 120, nir: 1200},
            {class: 2, red: 500, nir: 9000},
            {class: 2, red: 900, nir: 17000}
        ])
    })

    it('trains on a covariate only where the reused recipe\'s imagery supplying its features is unmasked', async () => {
        await reusable('provider', [input('optical', selecting('red'))], {optical: {red: [120, null, 500, 900]}})
        const recipe = await consumer([input('own', selecting('swir'))], {own: OWN}, {auxiliaryImagery: ['LATITUDE']})

        await trained(recipe)

        assert.deepEqual(state.trained[0].rows.slice(0, 3), [
            {class: 1, latitude: 10},
            {class: 2, latitude: 30},
            {class: 2, latitude: 50}
        ])
    })

    for (const [_case, providerImagery, ownImagery, included, failure] of [
        ['no input of the reused recipe holds a band it trains on', {red: OPTICAL.red}, OWN, ['red', 'nir'], /No input image .* supplies nir/],
        ['two inputs of the reused recipe hold a band it trains on', {...OPTICAL}, OWN, ['red', 'nir'], /More than one band of the input images of provider matches red \(input image 1: red; input image 2: red\)/],
        ['the reused recipe holds the spectral bands of an index it trains on as provided', OPTICAL, {red: OWN.red, ndvi: [1, 1, 1, 1]}, ['red', 'ndvi'], /No input image .* supplies ndvi/],
        ['the reused recipe provides an index it trains on as calculated', {red: OPTICAL.red, ndvi: [1, 1, 1, 1]}, OWN, ['red', 'ndvi'], /No input image .* supplies ndvi/]
    ]) {
        it(`fails, however readiness judged it, where ${_case}`, async () => {
            const inputs = _case.startsWith('two')
                ? [input('optical', selecting('red')), input('copy', selecting('red'))]
                : [input('optical', selecting('red'))]
            await reusable('provider', inputs, {optical: providerImagery, copy: {red: OPTICAL.red}})
            const recipe = await consumer([input('own', selecting(...included))], {own: ownImagery})

            await assert.rejects(trained(recipe), failure)
        })
    }

    it('fails, however readiness judged it, where two of its own inputs give one feature', async () => {
        await reusable('provider', [input('optical', selecting('red'))], {optical: OPTICAL})
        const recipe = await consumer([input('own', selecting('red')), input('again', selecting('red'))], {own: OWN, again: OWN})

        await assert.rejects(trained(recipe), /reusing the training data of provider has input images giving one feature name more than once/)
    })

    it('trains on a band of the reused recipe spelled otherwise, the one matching it, under its own spelling', async () => {
        await reusable('provider', [input('optical', selecting('Red'))], {optical: {RED: OPTICAL.red, Nir: OPTICAL.nir}})
        const recipe = await consumer([input('own', selecting('red', 'NIR'))], {own: {red: OWN.red, NIR: OWN.nir}})

        await trained(recipe)

        assert.deepEqual(state.trained[0].bandOrder, ['red', 'NIR'])
        assert.deepEqual(state.trained[0].rows.slice(0, 4), rows({red: OPTICAL.red, NIR: OPTICAL.nir}))
    })

    it('calculates an index of the reused recipe\'s bands spelled otherwise, each the one matching', async () => {
        await reusable('provider', [input('optical', selecting('red'))], {optical: {RED: OPTICAL.red, NIR: OPTICAL.nir}})
        const recipe = await consumer([input('own', selecting('ndvi'))], {own: OWN})

        await trained(recipe)

        assert.deepEqual(state.trained[0].rows.slice(0, 4).map(({ndvi}) => Math.round(ndvi * 1000)), [818, 818, 895, 899])
    })

    for (const [_case, providerInputs, imagery, included, failure] of [
        ['one input of the reused recipe holds a band it trains on twice, by case',
            () => [input('optical', selecting('red'))], {optical: {red: OPTICAL.red, Red: OPTICAL.red, nir: OPTICAL.nir}}, ['red', 'nir'],
            /More than one band of the input images of provider matches red \(input image 1: red, Red\)\. Give the bands distinct names in a Stack's Band names panel/],
        ['two inputs of the reused recipe hold a band it trains on spelled apart by case',
            () => [input('optical', selecting('red')), input('copy', selecting('red'))], {optical: OPTICAL, copy: {Red: OPTICAL.red}}, ['red', 'nir'],
            /matches red \(input image 1: red; input image 2: Red\)\. Give the bands distinct names/],
        ['a band an index it calculates is calculated of matches twice in one input of the reused recipe',
            () => [input('optical', selecting('red'))], {optical: {red: OPTICAL.red, RED: OPTICAL.red, nir: OPTICAL.nir}}, ['ndvi'],
            /matches ndvi \(input image 1: red, RED, nir\)/],
        ['the reused recipe lacks a band an index it calculates is calculated of',
            () => [input('optical', selecting('red'))], {optical: {red: OPTICAL.red}}, ['ndvi'],
            /No input image of provider supplies ndvi, built of red, nir, which one input image must hold/]
    ]) {
        it(`fails, naming the reused recipe and what to repair, where ${_case}`, async () => {
            await reusable('provider', providerInputs(), imagery)
            const recipe = await consumer([input('own', selecting(...included))], {own: OWN})

            await assert.rejects(trained(recipe), failure)
        })
    }

    // Only an input that can supply all a feature is built of is judged for holding a band of it twice.
    for (const [_case, bandSetSpecs, expected] of [
        ['an index', [{id: 'bands', type: 'IMAGE_BANDS', included: ['ndvi']}], ({red, nir}) => ({ndvi: red.map((r, p) => (nir[p] / 1e4 - r / 1e4) / (nir[p] / 1e4 + r / 1e4))})],
        ['a band combination', [{id: 'pairs', type: 'PAIR_WISE_EXPRESSION', included: ['red', 'nir'], operation: 'DIFFERENCE'}], ({red, nir}) => ({red_nir_difference: red.map((r, p) => r - nir[p])})]
    ]) {
        it(`trains on ${_case} of the input supplying it, whatever another input lacking a band of it holds twice`, async () => {
            await reusable('provider', [input('optical', selecting('red')), input('partial', selecting('red'))], {
                optical: OPTICAL, partial: {red: OPTICAL.red, Red: OPTICAL.red}
            })
            const recipe = await consumer([input('own', bandSetSpecs)], {own: OWN})

            await trained(recipe)

            assert.deepEqual(state.trained[0].rows.slice(0, 4), rows(expected(OPTICAL)))
        })
    }

    it('trains on a covariate overwriting a band it selects, whatever the reused recipe holds of that name', async () => {
        await reusable('provider', [input('optical', selecting('red'))], {optical: {red: OPTICAL.red, latitude: [1, 1, 1, 1], Latitude: [2, 2, 2, 2]}})
        const recipe = await consumer([input('own', selecting('red', 'latitude'))], {own: {red: OWN.red, latitude: [7, 7, 7, 7]}}, {auxiliaryImagery: ['LATITUDE']})

        await trained(recipe)

        assert.deepEqual(state.trained[0].rows.slice(0, 4), rows({red: OPTICAL.red, latitude: [10, 20, 30, 50]}))
    })

    it('trains, as readiness judges it supplied, on a combination of a band named as a covariate it configures, the covariate generated beside it', async () => {
        const difference = {id: 'pairs', type: 'PAIR_WISE_EXPRESSION', included: ['red', 'latitude'], operation: 'DIFFERENCE'}
        const providerInputs = [input('optical', selecting('red'))]
        const consumerInputs = [input('own', [difference])]
        const providerImagery = {red: OPTICAL.red, latitude: [1, 2, 3, 4]}
        const ownImagery = {red: OWN.red, latitude: [7, 7, 7, 7]}
        await reusable('provider', providerInputs, {optical: providerImagery})
        const recipe = await consumer(consumerInputs, {own: ownImagery}, {auxiliaryImagery: ['LATITUDE']})

        const requested = requestedFeatures({inputImagery: {images: consumerInputs}, auxiliaryImagery: ['LATITUDE']}, [described('own', Object.keys(ownImagery))])
        const supply = featureSupply(requested, {inputImagery: {images: providerInputs}}, [described('optical', Object.keys(providerImagery))])
        await trained(recipe)

        assert.deepEqual(requested.ambiguous, [])
        assert.deepEqual(supply.map(({feature: {name}, suppliers, colliding}) => [name, suppliers.length, colliding.length]), [['red_latitude_difference', 1, 0]])
        assert.deepEqual(state.trained[0].rows.slice(0, 4), rows({
            red_latitude_difference: providerImagery.red.map((red, p) => red - providerImagery.latitude[p]),
            latitude: [10, 20, 30, 50]
        }))
    })

    it('trains on a combination overwriting a band of its name, whatever the reused recipe holds of that name', async () => {
        const bandSetSpecs = [
            {id: 'bands', type: 'IMAGE_BANDS', included: ['red_nir_difference']},
            {id: 'pairs', type: 'PAIR_WISE_EXPRESSION', included: ['red', 'nir'], operation: 'DIFFERENCE'}
        ]
        await reusable('provider', [input('optical', selecting('red'))], {optical: {...OPTICAL, red_nir_difference: [1, 1, 1, 1], RED_NIR_DIFFERENCE: [2, 2, 2, 2]}})
        const recipe = await consumer([input('own', bandSetSpecs)], {own: {...OWN, red_nir_difference: [9, 9, 9, 9]}})

        await trained(recipe)

        assert.deepEqual(state.trained[0].rows.slice(0, 4), rows({red_nir_difference: OPTICAL.red.map((red, p) => red - OPTICAL.nir[p])}))
    })

    it('fails, however readiness judged it, where it combines two bands differing only in case', async () => {
        const difference = {id: 'pairs', type: 'PAIR_WISE_EXPRESSION', included: ['red', 'Red'], operation: 'DIFFERENCE'}
        await reusable('provider', [input('optical', selecting('red'))], {optical: {red: OPTICAL.red}})
        const recipe = await consumer([input('own', [difference])], {own: {red: [100, 100, 100, 100], Red: [20, 20, 20, 20]}})

        await assert.rejects(trained(recipe), /combines red and Red into red_Red_difference, which differ only in case/)
    })

    it('fails where two inputs of the reused recipe each hold all an index is built of', async () => {
        await reusable('provider', [input('optical', selecting('red')), input('copy', selecting('red'))], {optical: OPTICAL, copy: OPTICAL})
        const recipe = await consumer([input('own', selecting('ndvi'))], {own: OWN})

        await assert.rejects(trained(recipe), /matches ndvi \(input image 1: red, nir; input image 2: red, nir\)/)
    })

    it('fails, however readiness judged it, where two of its own inputs give a name spelled apart only by case', async () => {
        await reusable('provider', [input('optical', selecting('red'))], {optical: OPTICAL})
        const recipe = await consumer([input('own', selecting('red')), input('again', selecting('RED'))], {own: OWN, again: {RED: OWN.red}})

        await assert.rejects(trained(recipe), /giving one feature name more than once, whatever its case/)
    })

    // The collection classifies each scene with training data obtained once (lib/js/ee/src/timeSeries/collection.js).
    for (const scenes of [1, 3]) {
        it(`samples the reused recipe once to classify ${scenes} scene(s) with its training data`, async () => {
            await reusable('provider', [input('optical', selecting('red'))], {optical: OPTICAL})
            const recipe = await consumer([input('own', selecting('red', 'nir'))], {own: OWN})
            const trainingData = await firstValueFrom(recipe.getTrainingData$())

            for (let i = 0; i < scenes; i++) {
                recipe.classifyImage(image(OWN), ['class'], trainingData)
            }

            assert.deepEqual(state.samplings.map(({bands}) => bands), [['red', 'nir'], ['red', 'nir']])
            assert.equal(state.classified.length, scenes)
        })
    }
})

// The shared rule readiness refuses reuse by (lib/js/shared/src/recipe/bandSets.js featureSupply) and execution, run
// without it, come to the same: supplied, missing or ambiguous.
describe('readiness and execution of reuse', () => {
    const ALL = [1, 2, 3, 4]
    for (const [_case, included, providerImagery, expected] of [
        ['a band held as asked', ['red'], [{red: ALL}], 'SUPPLIED'],
        ['a band held only spelled otherwise', ['red'], [{RED: ALL}], 'SUPPLIED'],
        ['a band held twice in one input by case', ['red'], [{red: ALL, Red: ALL}], 'AMBIGUOUS'],
        ['a band held in two inputs by case', ['red'], [{red: ALL}, {Red: ALL}], 'AMBIGUOUS'],
        ['a band held nowhere', ['red'], [{nir: ALL}], 'MISSING'],
        ['an index of operands held spelled otherwise', ['ndvi'], [{Red: ALL, NIR: ALL}], 'SUPPLIED'],
        ['an index an operand of which is held twice by case', ['ndvi'], [{red: ALL, RED: ALL, nir: ALL}], 'AMBIGUOUS'],
        ['an index of operands held in two inputs', ['ndvi'], [{red: ALL}, {nir: ALL}], 'MISSING'],
        ['an index provided alone', ['ndvi'], [{ndvi: ALL}], 'MISSING'],
        ['a band beside another held twice by case', ['nir'], [{nir: ALL, red: ALL, Red: ALL}], 'SUPPLIED'],
        ['an index beside an input lacking a band of it, holding another twice', ['ndvi'], [{red: ALL, nir: ALL}, {red: ALL, Red: ALL}], 'SUPPLIED'],
        ['an index each of two inputs can supply', ['ndvi'], [{red: ALL, nir: ALL}, {RED: ALL, NIR: ALL}], 'AMBIGUOUS']
    ]) {
        it(`agree for ${_case}`, async () => {
            const providerInputs = providerImagery.map((_bands, i) => input(`p${i}`, selecting('red')))
            const ownImagery = {red: OWN.red, nir: OWN.nir}
            await reusable('provider', providerInputs, Object.fromEntries(providerImagery.map((bands, i) => [`p${i}`, bands])))
            const consumerInputs = [input('own', selecting(...included))]
            const recipe = await consumer(consumerInputs, {own: ownImagery})

            const requested = requestedFeatures({inputImagery: {images: consumerInputs}}, [described('own', Object.keys(ownImagery))])
            const supply = featureSupply(requested, {inputImagery: {images: providerInputs}}, providerImagery.map((bands, i) => described(`p${i}`, Object.keys(bands))))
            const judged = requested.ambiguous.length || supply.some(({suppliers, colliding}) => colliding.length || suppliers.length > 1)
                ? 'AMBIGUOUS'
                : supply.some(({suppliers}) => !suppliers.length) ? 'MISSING' : 'SUPPLIED'
            const executed = await trained(recipe).then(
                () => 'SUPPLIED',
                ({message}) => /No input image/.test(message) ? 'MISSING' : /More than one band of the input images|differ only in case/.test(message) ? 'AMBIGUOUS' : message
            )

            assert.deepEqual([judged, executed], [expected, expected])
        })
    }
})

describe('a Regression reusing training data', () => {
    it('trains on the features it defines, sampled of the reused recipe\'s imagery, labelled with its values, unscaled', async () => {
        state.recipes.provider = await regressionOf([input('optical', selecting('red'))], {optical: OPTICAL}, [plots([10, 20, 30, 40])])
        const recipe = await regressionOf([input('own', selecting('red', 'nir'))], {own: OWN}, [reused('provider'), plots([1, 2, 3, 4])])

        await firstValueFrom(recipe.getImage$())

        assert.deepEqual(state.trained[0].rows, [...valued([10, 20, 30, 40], OPTICAL), ...valued([1, 2, 3, 4], OWN)])
    })
})

// The combination is the recipe's own, of its own bands: nothing is matched whatever its case.
describe('a Classification reusing no training data, combining two bands differing only in case', () => {
    it('trains on its own points over that combination as Earth Engine computes it', async () => {
        const difference = {id: 'pairs', type: 'PAIR_WISE_EXPRESSION', included: ['red', 'Red'], operation: 'DIFFERENCE'}
        const recipe = await consumer([input('own', [difference])], {own: {red: [100, 100, 100, 100], Red: [20, 20, 20, 20]}}, {dataSets: [collected()]})

        await trained(recipe)

        assert.deepEqual(state.trained[0].rows, rows({red_Red_difference: [80, 80, 80, 80]}))
    })
})

describe('a Classification reusing no training data', () => {
    it('trains on its own points over its own features, its two inputs repeating a name as Earth Engine names them apart', async () => {
        const recipe = await consumer([input('own', selecting('red')), input('again', selecting('red'))], {own: OWN, again: {red: [1, 2, 3, 4]}}, {
            dataSets: [collected()]
        })

        await trained(recipe)

        assert.deepEqual(state.trained[0].rows, rows({red: OWN.red, red_1: [1, 2, 3, 4]}))
        assert.equal(state.samplings[0].projection, null)
    })
})

beforeEach(resetState)

const described = (id, bands) => ({description: {executionReference: {type: 'ASSET', id}, output: {bands: bands.map(name => ({name}))}}})

const selecting = (...included) => [{id: 'bands', type: 'IMAGE_BANDS', included}]

const input = (id, bandSetSpecs) => ({imageId: id, type: 'ASSET', id, bandSetSpecs})

const reused = recipe => ({type: 'RECIPE', recipe})

const classificationModel = ({images, dataSets = [collected()], classifier = RANDOM_FOREST, auxiliaryImagery = [], scale}) => ({
    inputImagery: {images},
    auxiliaryImagery,
    legend: {entries: [{value: 1}, {value: 2}]},
    trainingData: {dataSets},
    classifier,
    ...(scale && {scale})
})

// A recipe whose training data is reused, over `imagery` of each input by id, with a point at each pixel unless told
// otherwise.
const reusable = async (id, images, imagery, options = {}) => {
    state.recipes[id] = await classificationOf(classificationModel({images, ...options}), imagery, undefined, {id})
}

// The Classification under test, reusing the provider and storing a point at each pixel unless told otherwise.
const consumer = (images, imagery, {dataSets = [reused('provider'), collected()], ...options} = {}) =>
    classificationOf(classificationModel({images, dataSets, ...options}), imagery, {selection: ['class']})

const trained = recipe => firstValueFrom(recipe.getImage$())

const regressionOf = async (images, imagery, dataSets) => {
    Object.entries(imagery).forEach(([id, bands]) => state.imagery[id] = image(bands))
    const {default: regression} = await import('#sepal/ee/regression/regression')
    return regression({model: {inputImagery: {images}, trainingData: {dataSets}, classifier: RANDOM_FOREST}})
}

const plots = values => ({type: 'EE_TABLE', referenceData: values.map((value, x) => ({x, y: 0, value}))})

// A training row per point of collected(), with its class and the values of `bands` at its pixel.
const rows = bands => [1, 1, 2, 2].map((value, pixel) => ({
    class: value,
    ...Object.fromEntries(Object.entries(bands).map(([name, values]) => [name, values[pixel]]))
}))

const valued = (values, bands) => values.map((value, pixel) => ({
    value,
    ...Object.fromEntries(Object.entries(bands).map(([name, values]) => [name, values[pixel]]))
}))
