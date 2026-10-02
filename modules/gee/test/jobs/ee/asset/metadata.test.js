import {jest} from '@jest/globals'
import {createRequire} from 'module'
import {Observable, of, throwError} from 'rxjs'

// The /assetMetadata boundary, exercised through recording Earth Engine stubs (the house pattern from
// table/propertyFilter.test.js): ee.* needs an initialized API, so the structure the worker BUILDS is what is
// asserted. What matters here is how many evaluations a rich request costs, that the optional enrichment can
// never turn a usable asset into a missing one, and that an image asset's band types keep their array rank.
//
// An asset is answered by the Cloud API as Earth Engine answers it - a record shaped as `assets.get` returns it - and
// converted by the client's own legacy conversion, which needs no initialized API.

const client = createRequire(createRequire(import.meta.url).resolve('sepal-ee/src/ee.js'))('@google/earthengine')

const projection = (source, band) => ({
    nominalScale: () => ({nominalScaleOf: {source, band}})
})

const eeImage = source => ({
    source,
    select: bands => ({projection: () => projection(source, bands[0])}),
    merge: other => eeImage(`${source}+${other.source}`),
    first: () => eeImage(`${source}.first`),
    toDictionary: names => ({
        propertiesOf: source,
        names,
        keys: () => ({keysOf: source}),
        values: () => ({map: fn => ({typesOf: source, fn})})
    }),
    propertyNames: () => ({propertyNamesOf: source})
})

const getInfoCalls = []
const recordRequests = []
let responses = {}

const ee = {
    $: ({operation}) => new Observable(subscriber => operation(
        value => {
            subscriber.next(value)
            subscriber.complete()
        },
        error => subscriber.error(error)
    )),
    apiclient: {
        Call: class {
            constructor(callback) {
                this.callback = callback
            }

            assets() {
                return {get: name => name}
            }

            handle(name) {
                recordRequests.push(name)
                this.callback(responses.record)
            }
        }
    },
    rpc_convert: client.rpc_convert,
    Image: id => eeImage(`Image(${JSON.stringify(id)})`),
    ImageCollection: id => eeImage(`ImageCollection(${JSON.stringify(id)})`),
    Dictionary: {
        fromLists: (keys, values) => ({fromLists: {keys, values}})
    },
    Algorithms: {ObjectType: value => ({objectType: value})},
    getAsset$: () => responses.asset$,
    getInfo$: (value, description) => {
        getInfoCalls.push({value, description})
        const response = responses.getInfo?.[description]
        if (response === undefined) {
            return throwError(() => new Error(`Unexpected getInfo: ${description}`))
        }
        return typeof response === 'function' ? response(value) : of(response)
    }
}

jest.unstable_mockModule('#sepal/ee/ee', () => ({default: ee}))
jest.unstable_mockModule('#gee/jobs/job', () => ({job: config => config}))

const {default: metadata} = await import('#gee/jobs/ee/asset/metadata')
const {worker$} = metadata

const run = requestArgs => {
    let value, error
    worker$({requestArgs, credentials: {}}).subscribe({next: v => { value = v }, error: e => { error = e }})
    return {value, error}
}

// An asset record as the Cloud API returns it, and what ee.data.getAsset makes of the same record.
const imageRecord = bands => ({
    type: 'IMAGE',
    name: 'projects/earthengine-legacy/assets/users/test/strata',
    updateTime: '2026-10-01T06:23:41.888670Z',
    properties: {system_time_start: 1},
    bands
})

const band = (id, dataType = {precision: 'INT', range: {min: 0, max: 255}}) => ({
    id,
    ...(dataType && {dataType}),
    grid: {
        crsCode: 'EPSG:4326',
        affineTransform: {scaleX: 0.0000898315, translateX: 23.5, scaleY: -0.0000898315, translateY: 12.5},
        dimensions: {width: 5015, height: 3093}
    },
    pyramidingPolicy: 'MEAN'
})

const legacy = record => client.rpc_convert.assetToLegacyResult(record)

// A distinct scale per band, so a response mapped onto the wrong band is visible rather than plausible.
const scales = {
    'Get band nominal scales': ({fromLists: {keys}}) =>
        of(Object.fromEntries(keys.map((id, index) => [id, 10 + index])))
}

beforeEach(() => {
    getInfoCalls.length = 0
    recordRequests.length = 0
    responses = {}
})

describe('an ordinary metadata request', () => {
    it('is what ee.data.getAsset describes, read in one request with no evaluation', () => {
        const record = imageRecord([band('label')])
        responses.record = record
        const {value} = run({asset: 'users/test/strata', allowedTypes: ['Image']})
        expect(value).toEqual({...legacy(record), bandNames: ['label']})
        expect(recordRequests).toEqual(['projects/earthengine-legacy/assets/users/test/strata'])
        expect(getInfoCalls).toEqual([])
    })

    it('costs no Earth Engine evaluation for an explicit false', () => {
        responses.record = imageRecord([band('label')])
        run({asset: 'users/test/strata', includeNominalScale: false})
        expect(getInfoCalls).toEqual([])
    })
})

// The legacy conversion keeps a band's precision and range but not the rank the record states, and names the band's
// grid `dimensions`. An evaluated image's band types state an array's rank as `data_type.dimensions` and a scalar's not
// at all, so that is the form kept here.
describe('an image asset\'s band types', () => {
    const array = (precision, dimensionsCount) => ({precision, range: null, dimensionsCount})

    it('state each array band\'s rank and no rank for a scalar, apart from its grid', () => {
        responses.record = imageRecord([
            band('elevation', {precision: 'INT', range: {min: -32768, max: 32767}}),
            band('zero', {precision: 'INT', range: {min: 0, max: 1}, dimensionsCount: 0}),
            band('tStart', array('DOUBLE', 1)),
            band('ndvi_coefs', array('DOUBLE', 2))
        ])

        const {value} = run({asset: 'users/test/strata'})

        expect(value.bands.map(({id, data_type, dimensions}) => [id, data_type.dimensions, dimensions])).toEqual([
            ['elevation', undefined, [5015, 3093]],
            ['zero', undefined, [5015, 3093]],
            ['tStart', 1, [5015, 3093]],
            ['ndvi_coefs', 2, [5015, 3093]]
        ])
    })

    it('change nothing else the legacy conversion describes', () => {
        const record = imageRecord([band('label'), band('tStart', array('DOUBLE', 1))])
        responses.record = record

        const {value} = run({asset: 'users/test/strata'})

        const withoutRank = ({data_type: {dimensions: _dimensions, ...dataType}, ...band}) => ({...band, data_type: dataType})
        expect({...value, bands: value.bands.map(withoutRank)}).toEqual({...legacy(record), bandNames: ['label', 'tStart']})
    })

    it('leave a type that is missing or states no rank as a count unknown, never a scalar', () => {
        responses.record = imageRecord([band('untyped', null), band('malformed', array('DOUBLE', 'two'))])

        const {value} = run({asset: 'users/test/strata'})

        expect(value.bands[0]).not.toHaveProperty('data_type')
        expect(value.bands[1].data_type.dimensions).toBe('two')
    })
})

// A Cloud GeoTIFF is no asset Earth Engine keeps: it is evaluated as an image, whose band types state their rank.
describe('a Cloud GeoTIFF', () => {
    it('is described by the image it evaluates, and no asset record is read', () => {
        const evaluated = {id: 'gs://bucket/segments.tif', type: 'Image', properties: {}, bands: [{id: 'b1', data_type: {type: 'PixelType', precision: 'float'}}]}
        responses.asset$ = of(evaluated)

        const {value} = run({asset: 'gs://bucket/segments.tif'})

        expect(value).toEqual({...evaluated, bandNames: ['b1']})
        expect(recordRequests).toEqual([])
    })
})

describe('a rich metadata request', () => {
    const runRich = bands => {
        responses.record = imageRecord(bands)
        responses.getInfo = scales
        return run({asset: 'users/test/strata', includeNominalScale: true})
    }

    it('adds each selected band nominal scale', () => {
        const {value} = runRich([band('label'), band('confidence')])
        expect(value.bands.map(({id, nominalScale}) => ({id, nominalScale})))
            .toEqual([{id: 'label', nominalScale: 10}, {id: 'confidence', nominalScale: 11}])
    })

    it('preserves every existing band field, including the generic crs_transform', () => {
        const bands = [band('label')]
        const {value} = runRich(bands)
        expect(value.bands[0]).toEqual({...legacy(imageRecord(bands)).bands[0], nominalScale: 10})
    })

    // One evaluation for the whole asset, never one per band: an eight-band source must cost exactly what a
    // one-band source costs.
    it.each([1, 2, 8])('uses exactly one evaluation for %i bands', count => {
        runRich(Array.from({length: count}, (_v, index) => band(`b${index}`)))
        expect(getInfoCalls).toHaveLength(1)
        expect(getInfoCalls[0].value.fromLists.keys).toHaveLength(count)
    })

    it('reads the scale of each band in its own right, not of the asset', () => {
        runRich([band('label'), band('confidence')])
        expect(getInfoCalls[0].value.fromLists.values.map(({nominalScaleOf: {band}}) => band))
            .toEqual(['label', 'confidence'])
    })

    // Enrichment is optional. Failing it must leave the caller with ordinary, usable metadata rather than
    // reporting an asset that plainly exists as missing.
    it('falls back to ordinary metadata when the scales cannot be evaluated', () => {
        const record = imageRecord([band('label')])
        responses.record = record
        responses.getInfo = {'Get band nominal scales': () => throwError(() => new Error('EE is unwell'))}
        const {value, error} = run({asset: 'users/test/strata', includeNominalScale: true})
        expect(error).toBeUndefined()
        expect(value).toEqual({...legacy(record), bandNames: ['label']})
    })

    it('skips the evaluation entirely for an asset with no bands', () => {
        const record = {type: 'TABLE', name: 'projects/earthengine-legacy/assets/users/test/table'}
        responses.record = record
        const {value} = run({asset: 'users/test/table', includeNominalScale: true})
        expect(getInfoCalls).toEqual([])
        expect(value).toEqual(legacy(record))
    })
})

describe('a rich ImageCollection request', () => {
    it('reads the scales from the same first member the bands come from', () => {
        const bands = [{id: 'label', data_type: {type: 'PixelType', precision: 'double', dimensions: 2}}]
        responses.record = {type: 'IMAGE_COLLECTION', name: 'projects/earthengine-legacy/assets/users/test/collection', properties: {}}
        responses.getInfo = {
            'Get first image in collection': {bands},
            'Get first image properties': {system_time_start: 1},
            'Get first image property types': {system_time_start: 'Number'},
            ...scales
        }
        const {value} = run({asset: 'users/test/collection', includeNominalScale: true})
        expect(value.bands[0].nominalScale).toBe(10)
        // Its band types are the first member's as evaluated, which state an array's rank themselves.
        expect(value.bands[0].data_type).toEqual(bands[0].data_type)
        const scaleCall = getInfoCalls.find(({description}) => description === 'Get band nominal scales')
        const bandsCall = getInfoCalls.find(({description}) => description === 'Get first image in collection')
        // The same first member, not a mosaic: a mosaic reports the identity grid instead of a real one.
        expect(scaleCall.value.fromLists.values[0].nominalScaleOf.source).toBe(bandsCall.value.source)
        expect(bandsCall.value.source).toContain('.first')
    })
})
