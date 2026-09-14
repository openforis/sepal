import {jest} from '@jest/globals'
import {of, throwError} from 'rxjs'

// The /assetMetadata boundary, exercised through recording Earth Engine stubs (the house pattern from
// table/propertyFilter.test.js): ee.* needs an initialized API, so the structure the worker BUILDS is what is
// asserted. What matters here is how many evaluations a rich request costs, and that the optional enrichment
// can never turn a usable asset into a missing one.

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
let responses = {}

const ee = {
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

const imageAsset = bands => ({
    id: 'users/test/strata',
    type: 'Image',
    properties: {system_time_start: 1},
    bands
})

const band = (id, extra = {}) => ({
    id,
    crs: 'EPSG:4326',
    crs_transform: [0.0000898315, 0, 23.5, 0, -0.0000898315, 12.5],
    data_type: {precision: 'int', min: 0, max: 255},
    ...extra
})

// A distinct scale per band, so a response mapped onto the wrong band is visible rather than plausible.
const scales = {
    'Get band nominal scales': ({fromLists: {keys}}) =>
        of(Object.fromEntries(keys.map((id, index) => [id, 10 + index])))
}

beforeEach(() => {
    getInfoCalls.length = 0
    responses = {}
})

describe('an ordinary metadata request', () => {
    it('is unchanged when the nominal scales are not asked for', () => {
        const asset = imageAsset([band('label')])
        responses.asset$ = of(asset)
        const {value} = run({asset: asset.id, allowedTypes: ['Image']})
        expect(value).toEqual({...asset, bandNames: ['label']})
        expect(getInfoCalls).toEqual([])
    })

    it('costs no Earth Engine evaluation for an explicit false', () => {
        responses.asset$ = of(imageAsset([band('label')]))
        run({asset: 'users/test/strata', includeNominalScale: false})
        expect(getInfoCalls).toEqual([])
    })
})

describe('a rich metadata request', () => {
    const runRich = bands => {
        const asset = imageAsset(bands)
        responses.asset$ = of(asset)
        responses.getInfo = scales
        return run({asset: asset.id, includeNominalScale: true})
    }

    it('adds each selected band nominal scale', () => {
        const {value} = runRich([band('label'), band('confidence')])
        expect(value.bands.map(({id, nominalScale}) => ({id, nominalScale})))
            .toEqual([{id: 'label', nominalScale: 10}, {id: 'confidence', nominalScale: 11}])
    })

    it('preserves every existing band field, including the generic crs_transform', () => {
        const bands = [band('label')]
        const {value} = runRich(bands)
        expect(value.bands[0]).toEqual({...bands[0], nominalScale: 10})
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
        const asset = imageAsset([band('label')])
        responses.asset$ = of(asset)
        responses.getInfo = {'Get band nominal scales': () => throwError(() => new Error('EE is unwell'))}
        const {value, error} = run({asset: asset.id, includeNominalScale: true})
        expect(error).toBeUndefined()
        expect(value).toEqual({...asset, bandNames: ['label']})
    })

    it('skips the evaluation entirely for an asset with no bands', () => {
        responses.asset$ = of({id: 'users/test/table', type: 'Table'})
        const {value} = run({asset: 'users/test/table', includeNominalScale: true})
        expect(getInfoCalls).toEqual([])
        expect(value).toEqual({id: 'users/test/table', type: 'Table'})
    })
})

describe('a rich ImageCollection request', () => {
    it('reads the scales from the same first member the bands come from', () => {
        const bands = [band('label')]
        responses.asset$ = of({id: 'users/test/collection', type: 'ImageCollection', properties: {}})
        responses.getInfo = {
            'Get first image in collection': {bands},
            'Get first image properties': {system_time_start: 1},
            'Get first image property types': {system_time_start: 'Number'},
            ...scales
        }
        const {value} = run({asset: 'users/test/collection', includeNominalScale: true})
        expect(value.bands[0].nominalScale).toBe(10)
        const scaleCall = getInfoCalls.find(({description}) => description === 'Get band nominal scales')
        const bandsCall = getInfoCalls.find(({description}) => description === 'Get first image in collection')
        // The same first member, not a mosaic: a mosaic reports the identity grid instead of a real one.
        expect(scaleCall.value.fromLists.values[0].nominalScaleOf.source).toBe(bandsCall.value.source)
        expect(bandsCall.value.source).toContain('.first')
    })
})
