// Read-only regression checks over controlled collections, using real Phenology and file casting.
// node --experimental-test-module-mocks verify/phenologyRegressionPrecision.mjs
import assert from 'node:assert/strict'
import {mock} from 'node:test'

import {firstValueFrom, of, timeout} from 'rxjs'

import {googleProjectId, serviceAccountCredentials} from '#gee/config'
import {castToLargest} from '#gee/jobs/task/export/castToLargest'
import ee from '#sepal/ee/ee'

const callback = operation => new Promise((resolve, reject) => operation(resolve, reject))
await callback((resolve, reject) => ee.data.authenticateViaPrivateKey(serviceAccountCredentials, resolve, reject))
await callback((resolve, reject) => ee.initialize(null, null, resolve, reject, null, googleProjectId))
ee.setMaxRetries(0)
let observations
mock.module('#sepal/ee/timeSeries/collection', {exports: {getCollection$: () => of(observations)}})
const {default: phenology} = await import('#sepal/ee/timeSeries/phenology')

const area = ee.Geometry.Rectangle([-0.002, -0.002, 0.002, 0.002])
const mask = ee.Image.pixelLonLat().select('longitude').lt(0.0005)
const sample = image => ee.Dictionary({
    values: image.reduceRegion({reducer: ee.Reducer.first(), geometry: ee.Geometry.Point([0, 0]), scale: 30}),
    masked: image.reduceRegion({reducer: ee.Reducer.first(), geometry: ee.Geometry.Point([0.001, 0]), scale: 30}),
    types: image.bandTypes()
})
const close = (actual, expected) => assert.ok(Math.abs(actual - expected) <= Math.max(1e-7, Math.abs(expected) * 1e-6), `${actual} != ${expected}`)

// Native values/masks/types from the established seasonal control.
const NATIVE_VALUES = {
    amplitude: 520,
    april: 2280,
    august: 1795,
    background: 1740,
    dayOfYear_1: 228,
    dayOfYear_2: 350,
    dayOfYear_3: 46,
    dayOfYear_4: 167,
    days_1: 122,
    days_2: 61,
    days_3: 121,
    days_4: 61,
    december: 1850,
    february: 2205,
    january: 2075,
    july: 1925,
    june: 2075,
    march: 2280,
    may: 2205,
    median: 2000,
    median_1: 1740,
    median_2: 2000,
    median_3: 2260,
    median_4: 2000,
    november: 1795,
    october: 1720,
    offset_1: 1656.445556640625,
    offset_2: 2006.7164306640625,
    offset_3: 2210.157470703125,
    offset_4: 2978.888916015625,
    september: 1720,
    slope_1: 0.34411293268203735,
    slope_2: -0.447761207818985,
    slope_3: 0.18925419449806213,
    slope_4: -4.977962017059326,
}
const NATIVE_TYPES = Object.fromEntries([
    ...['amplitude', 'background', 'dayOfYear_1', 'dayOfYear_2', 'dayOfYear_3', 'dayOfYear_4', 'days_1', 'days_2', 'days_3', 'days_4', 'median', 'median_1', 'median_2', 'median_3', 'median_4'].map(name => [name, {'type': 'PixelType', 'precision': 'int', 'min': -32768, 'max': 32767}]),
    ...['april', 'august', 'december', 'february', 'january', 'july', 'june', 'march', 'may', 'november', 'october', 'september'].map(name => [name, {'type': 'PixelType', 'precision': 'double', 'min': -32768, 'max': 32767}]),
    ...['offset_1', 'offset_2', 'offset_3', 'offset_4', 'slope_1', 'slope_2', 'slope_3', 'slope_4'].map(name => [name, {'type': 'PixelType', 'precision': 'float'}]),
])
const NATIVE_CONTROL = {
    values: NATIVE_VALUES,
    types: NATIVE_TYPES,
    masked: Object.fromEntries(Object.keys(NATIVE_VALUES).map(name => [name, /^(offset|slope)_/.test(name) ? 0 : null]))
}

const cases = [
    {name: 'native', band: 'red'},
    {name: 'optical', band: 'regression', factor: 1000, centre: 0.1255, median: 125.49999237060547},
    {name: 'radar', band: 'regression', factor: 1, centre: 0.1255, median: 0.12549999356269836},
    {name: 'planet', band: 'regression', factor: 1, centre: 0.1255, median: 0.12549999356269836},
    {name: 'optical-range', band: 'regression', factor: 1000, centre: 40.00075, median: 40000.75},
    {name: 'radar-negative', band: 'regression', factor: 1, centre: -1.8755, median: -1.875499963760376}
]
const results = {}
for (const fixture of cases) {
    observations = ee.ImageCollection(Array.from({length: 36}, (_, i) => {
        const seasonal = Math.sin(2 * Math.PI * i / 12)
        const value = fixture.band === 'red' ? ee.Image(Math.round(2000 + 300 * seasonal)).int16()
            : ee.Image(fixture.centre + 0.02 * seasonal).float().multiply(fixture.factor).float()
        return value.rename(fixture.band).updateMask(mask).clip(area)
            .set('system:time_start', ee.Date.fromYMD(2020 + Math.floor(i / 12), i % 12 + 1, 15).millis())
    }))
    const recipe = {model: {aoi: {type: 'GEOMETRY', geometry: area}, dates: {fromYear: 2020, toYear: 2022}, sources: {band: fixture.band}, options: {}}}
    const output = await firstValueFrom(phenology(recipe).getImage$())
    results[fixture.name] = ee.Dictionary({image: sample(output), file: sample(castToLargest(output))})
}
const mixed = ee.Image(0.125).float().rename('regression')
    .addBands(ee.Image(16777217).int32().rename('count'))
    .addBands(ee.Image(1700000000123).int64().rename('timestamp'))
results.mixed = sample(castToLargest(mixed))
results.floatOnly = sample(castToLargest(ee.Image(0.125).float().rename('regression')))
const values = await firstValueFrom(ee.getInfo$(ee.Dictionary(results), 'Phenology regression precision').pipe(timeout(55000)))

for (const fixture of cases) {
    const {image, file} = values[fixture.name]
    assert.equal(Object.keys(image.values).length, 35)
    assert.deepEqual(image.masked, NATIVE_CONTROL.masked)
    assert.deepEqual(file.masked, image.masked)
    for (const [name, type] of Object.entries(image.types)) {
        if (/^(dayOfYear|days)_/.test(name)) {
            assert.equal(type.precision, 'int')
            assert.equal(type.min, -32768)
            assert.equal(type.max, 32767)
            assert.ok(image.values[name] === null || Number.isInteger(image.values[name]))
        }
        if (image.values[name] === null) {
            assert.equal(file.values[name], null)
        } else {
            close(file.values[name], image.values[name])
        }
    }
    if (fixture.band === 'regression') {
        close(image.values.median, fixture.median)
        for (const name of ['median', 'background', 'amplitude', 'median_1', 'median_2', 'median_3', 'median_4']) {
            assert.equal(image.types[name].precision, 'float')
        }
    } else {
        assert.deepEqual(image, NATIVE_CONTROL)
    }
}
assert.equal(values.mixed.values.count, 16777217)
assert.equal(values.mixed.values.timestamp, 1700000000123)
assert.equal(values.mixed.values.regression, 0.125)
assert.ok(Object.values(values.mixed.types).every(type => type.precision === 'double'))
assert.equal(values.floatOnly.values.regression, 0.125)
assert.equal(values.floatOnly.types.regression.precision, 'float')
console.info('Phenology regression precision: values, range, masks, timing, native control and mixed file promotion passed')
