import {jest} from '@jest/globals'
import {firstValueFrom, of} from 'rxjs'

const delegatedGeometry = {delegatedGeometry: true}
const runtimeGeometry = {runtimeGeometry: true}
const imageFactory = jest.fn(() => ({
    getGeometry$: () => of(delegatedGeometry)
}))

const eeTable = {eeTable: true}
const Feature = jest.fn(geometry => ({feature: geometry}))
const FeatureCollection = jest.fn(value => value === 'users/example/table'
    ? eeTable
    : {featureCollection: value}
)

jest.unstable_mockModule('#sepal/ee/imageFactory', () => ({default: imageFactory}))
jest.unstable_mockModule('#sepal/ee/ee', () => ({
    default: {Feature, FeatureCollection}
}))

const {toFeatureCollection$, toGeometry$} = await import('#sepal/ee/aoi')

const settle = observable => firstValueFrom(observable).then(
    value => ({value}),
    error => ({error})
)

beforeEach(() => {
    imageFactory.mockClear()
    Feature.mockClear()
    FeatureCollection.mockClear()
})

describe.each([
    ['ASSET', 'ASSET', 'ASSET AOI requires a non-blank string ID.'],
    ['RECIPE', 'RECIPE_REF', 'RECIPE AOI requires a non-blank string ID.']
])('%s reference AOI', (type, delegatedType, requiredIdMessage) => {
    it.each([
        ['an absent ID', undefined, false],
        ['a null ID', null, true],
        ['a blank ID', '', true],
        ['a whitespace-only ID', '   ', true],
        ['a non-string ID', 42, true]
    ])('rejects %s without constructing an image factory', async (_case, id, includeId) => {
        const aoi = includeId ? {type, id} : {type}
        let geometry$

        expect(() => {
            geometry$ = toGeometry$(aoi)
        }).not.toThrow()

        const outcome = await settle(geometry$)
        expect({
            error: outcome.error?.message,
            imageFactoryCalls: imageFactory.mock.calls
        }).toEqual({
            error: requiredIdMessage,
            imageFactoryCalls: []
        })
    })

    it('delegates a valid ID unchanged and emits the resolved geometry', async () => {
        const id = '  users/example/reference  '

        await expect(firstValueFrom(toGeometry$({type, id}))).resolves.toBe(delegatedGeometry)
        expect(imageFactory).toHaveBeenCalledTimes(1)
        expect(imageFactory).toHaveBeenCalledWith({type: delegatedType, id})
    })
})

describe('null geometry AOI compatibility', () => {
    it('continues emitting null from toGeometry$ without constructing an image factory', async () => {
        await expect(firstValueFrom(toGeometry$(null))).resolves.toBeNull()
        expect(imageFactory).not.toHaveBeenCalled()
    })
})

describe('required feature-collection AOI', () => {
    it.each([
        ['null', null],
        ['undefined', undefined]
    ])('rejects %s without constructing an Earth Engine feature', async (_case, aoi) => {
        let featureCollection$

        expect(() => {
            featureCollection$ = toFeatureCollection$(aoi)
        }).not.toThrow()

        const outcome = await settle(featureCollection$)
        expect({
            error: outcome.error?.message,
            featureCalls: Feature.mock.calls,
            featureCollectionCalls: FeatureCollection.mock.calls
        }).toEqual({
            error: 'An AOI is required to create a feature collection.',
            featureCalls: [],
            featureCollectionCalls: []
        })
    })

    it('keeps an EE_TABLE as the feature collection itself', async () => {
        const aoi = {type: 'EE_TABLE', id: 'users/example/table'}

        await expect(firstValueFrom(toFeatureCollection$(aoi))).resolves.toBe(eeTable)
        expect(FeatureCollection).toHaveBeenCalledTimes(1)
        expect(FeatureCollection).toHaveBeenCalledWith(aoi.id)
        expect(Feature).not.toHaveBeenCalled()
    })

    it('wraps a valid non-table geometry in one feature and one feature collection', async () => {
        const featureCollection = await firstValueFrom(toFeatureCollection$({
            type: 'GEOMETRY',
            geometry: runtimeGeometry
        }))
        const feature = Feature.mock.results[0].value

        expect(Feature).toHaveBeenCalledTimes(1)
        expect(Feature).toHaveBeenCalledWith(runtimeGeometry)
        expect(Feature.mock.calls[0][0]).toBe(runtimeGeometry)
        expect(FeatureCollection).toHaveBeenCalledTimes(1)
        expect(FeatureCollection).toHaveBeenCalledWith([feature])
        expect(featureCollection).toBe(FeatureCollection.mock.results[0].value)
    })

    it.each([
        [
            'a malformed GEOMETRY wrapper',
            {type: 'GEOMETRY'},
            'A GEOMETRY aoi requires a geometry.'
        ],
        [
            'an unknown type',
            {type: 'SOMETHING_NEW'},
            'Unsupported aoi type: SOMETHING_NEW'
        ],
        [
            'an empty descriptor',
            {},
            'Unsupported aoi type: undefined'
        ],
        [
            'ASSET_BOUNDS without source context',
            {type: 'ASSET_BOUNDS'},
            'An ASSET_BOUNDS aoi cannot be resolved without source-image context'
        ]
    ])('does not reclassify %s as a missing AOI', async (_case, aoi, message) => {
        await expect(firstValueFrom(toFeatureCollection$(aoi))).rejects.toThrow(message)
        expect(Feature).not.toHaveBeenCalled()
        expect(FeatureCollection).not.toHaveBeenCalled()
    })
})
