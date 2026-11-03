import assert from 'node:assert/strict'
import {beforeEach, describe, it, mock} from 'node:test'

import {delay, firstValueFrom, of} from 'rxjs'

import {image, resetState, state} from '../classification/numericEarthEngine.js'

mock.module('#gee/jobs/task/storage/destination', {exports: {exportFolderName: name => name, prepareDestination$: () => of({destination: {type: 'drive'}, exportTarget: {type: 'drive'}})}})

const source = () => ({map: process => ({images: [process(state.source)], limit: () => ({size: () => 1})})})
mock.module('#sepal/ee/optical/collection', {exports: {allScenes: source}})
mock.module('#sepal/ee/radar/collection', {exports: {createCollection: source}})
mock.module('#sepal/ee/planet/collection', {exports: {createCollection: source}})
mock.module('#sepal/ee/optical/addTasseledCap', {exports: {default: image => image}})
mock.module('#sepal/ee/optical/indexes', {exports: {calculateIndex: () => image({}), supportedIndexes: () => []}})
mock.module('#sepal/ee/validate', {exports: {validateEEImageCollection: ({imageCollection}) => imageCollection}})

const {default: ee} = await import('#sepal/ee/ee')
const {inEEContext} = await import('#sepal/ee/eeContext')
const {startImageToAssetExport$} = await import('#gee/jobs/task/export/toAsset')
const {startImageToWorkspaceExport$} = await import('#gee/jobs/task/export/toWorkspace')
const {getCollection$} = await import('#sepal/ee/timeSeries/collection')
const {withRegressionPrecision$} = await import('#sepal/ee/timeSeries/regressionPrecision')
const {castToLargest} = await import('#gee/jobs/task/export/castToLargest')

beforeEach(() => {
    resetState()
    state.exports = []
    Object.assign(ee, {
        data: {ExportDestination: {ASSET: 'ASSET', DRIVE: 'DRIVE'}, ExportType: {IMAGE: 'IMAGE'}},
        batch: {Export: {convertToServerParams: config => config}, ExportTask: {create: config => config}},
        createParentFolder$: () => of(true),
        startImageExport$: config => { state.exports.push(config); return of('task-1') },
        Geometry: geometry => geometry
    })
    state.recipes.classifier = {
        getBands$: () => of(['regression', 'probability_1']),
        getTrainingData$: () => of(null),
        classifyImage: (input, bands) => {
            state.predictionFeatures = input
            return image({regression: [0.125, -1.8755, 40.00075, null], probability_1: [37, 62, 100, null]})
                .select(bands).float()
        }
    }
})

for (const [family, dataSets, nativeBand, native, expectedNative, expectedRegression, probability, scales] of [
    ['Optical', {LANDSAT: ['LANDSAT_8']}, 'red', 1234.75, 1234, [125, -1875.5, 40000.75, null], [3700, 6200, 10000, null], [1000]],
    ['Radar', {SENTINEL_1: ['SENTINEL_1']}, 'VV', -12.345, -1234, [0.125, -1.875499963760376, 40.00075149536133, null], [37, 62, 100, null], [1]],
    ['Planet', {PLANET: ['BASEMAPS']}, 'red', 1234.75, 1234, [0.125, -1.875499963760376, 40.00075149536133, null], [37, 62, 100, null], [1]]
]) {
    describe(`${family} regression storage`, () => {
        it('preserves fractions, negatives, range, independent masks, order and properties in existing public units', async () => {
            state.source = image({[nativeBand]: [native, native, native, native]}).set('scene', 'scene-1')
            const recipe = {model: {sources: {dataSets, classification: 'classifier'}, dates: {}, options: {corrections: []}}}

            const {image: collection, regressionPrecision} = await firstValueFrom(withRegressionPrecision$(getCollection$({
                recipe, geometry: 'aoi', bands: [nativeBand, 'regression', 'probability_1']
            })))

            const stored = collection.images[0]
            assert.deepEqual(stored.bands.regression, expectedRegression)
            assert.deepEqual(stored.bands.probability_1, probability)
            assert.deepEqual(stored.bands[nativeBand], [expectedNative, expectedNative, expectedNative, expectedNative])
            assert.deepEqual(Object.keys(stored.bands), [nativeBand, 'regression', 'probability_1'])
            assert.equal(stored.types.regression.precision, 'float')
            assert.equal(stored.types[nativeBand].precision, 'int')
            assert.equal(stored.types.probability_1.precision, 'int')
            assert.deepEqual(stored.properties, {scene: 'scene-1', date: '2020-01-01'})
            assert.deepEqual(state.predictionFeatures.bands[nativeBand], [native, native, native, native])
            assert.deepEqual(JSON.parse(regressionPrecision), {version: 1, scales})
            assert.deepEqual(castToLargest(stored).bands, stored.bands)
            const params = {image: stored, region: {bounds: () => ({})}, description: 'regression', assetId: 'projects/p/assets/result', regressionPrecision}
            const context = {auth: {type: 'user'}}
            await firstValueFrom(inEEContext(context, startImageToAssetExport$(params)))
            await firstValueFrom(inEEContext(context, startImageToWorkspaceExport$({...params, folder: 'fresh'}, {sepalUser: {username: 'test'}})))
            assert.deepEqual(state.exports[0].image.bands, stored.bands)
            assert.deepEqual(state.exports[0].image.types, stored.types)
            assert.equal(state.exports[0].image.properties.sepal_regression_precision, regressionPrecision)
            assert.deepEqual(state.exports[1].image.bands, stored.bands)
            assert.ok(Object.values(state.exports[1].image.types).every(type => type.precision === 'float'))
        })

        it('does not mark native-only or probability-only computations as affected', async () => {
            state.source = image({[nativeBand]: [native, native, native, native]})
            for (const bands of [[nativeBand], ['probability_1']]) {
                const result = await firstValueFrom(withRegressionPrecision$(getCollection$({
                    recipe: {model: {sources: {dataSets, classification: 'classifier'}, dates: {}, options: {}}},
                    geometry: 'aoi', bands
                })))
                assert.equal(result.regressionPrecision, null)
                assert.ok(Object.values(result.image.images[0].types).every(type => type.precision === 'int'))
            }
        })
    })
}

it('promotes mixed float and large integer bands to double without losing integers, masks or fractions', () => {
    const mixed = image({regression: [0.125, -1.8755, 40000.75, null]}).float()
        .addBands(image({count: [16777217, 2147483647, -2147483648, null]}))
    mixed.types.count = {precision: 'int', min: -2147483648, max: 2147483647}

    const exported = castToLargest(mixed)

    assert.deepEqual(exported.bands, mixed.bands)
    assert.ok(Object.values(exported.types).every(type => type.precision === 'double'))
})

it('keeps execution evidence isolated across asynchronous export constructions', async () => {
    state.source = image({red: [1, 1, 1, 1], VV: [-12, -12, -12, -12]})
    state.recipes.classifier.getTrainingData$ = () => of(null).pipe(delay(1))
    const build = dataSets => firstValueFrom(withRegressionPrecision$(getCollection$({
        recipe: {model: {sources: {dataSets, classification: 'classifier'}, dates: {}, options: {}}},
        geometry: 'aoi', bands: ['regression']
    })))

    const [optical, radar] = await Promise.all([build({LANDSAT: ['LANDSAT_8']}), build({SENTINEL_1: ['SENTINEL_1']})])

    assert.deepEqual(JSON.parse(optical.regressionPrecision), {version: 1, scales: [1000]})
    assert.deepEqual(JSON.parse(radar.regressionPrecision), {version: 1, scales: [1]})
})

it('keeps float-only downloads and integer-only controls in their existing types', () => {
    const floating = image({regression: [0.125, -1.8755, 40000.75, null]}).float()
    const integer = image({native: [1234, -1234, 32767, null]}).int16()

    assert.deepEqual(castToLargest(floating).bands, floating.bands)
    assert.ok(Object.values(castToLargest(floating).types).every(type => type.precision === 'float'))
    assert.deepEqual(castToLargest(integer).bands, integer.bands)
    assert.deepEqual(castToLargest(integer).types, integer.types)
})
