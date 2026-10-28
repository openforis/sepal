import assert from 'node:assert/strict'
import {beforeEach, describe, it, mock} from 'node:test'

import {firstValueFrom, of} from 'rxjs'

import {callsOf} from '#sepal/testSupport/mock'

const delegatedGeometry = {delegatedGeometry: true}
const runtimeGeometry = {runtimeGeometry: true}
const imageFactory = mock.fn(() => ({
    getGeometry$: () => of(delegatedGeometry)
}))

const eeTable = {eeTable: true}
const Feature = mock.fn(geometry => ({feature: geometry}))
const FeatureCollection = mock.fn(value => value === 'users/example/table'
    ? eeTable
    : {featureCollection: value})

mock.module('#sepal/ee/imageFactory', {
    exports: {
        default: imageFactory
    }
})
mock.module('#sepal/ee/ee', {
    exports: {
        default: {Feature, FeatureCollection}
    }
})

const {toFeatureCollection$, toGeometry$} = await import('#sepal/ee/aoi')

const settle = observable => firstValueFrom(observable).then(
    value => ({value}),
    error => ({error})
)

beforeEach(() => {
    imageFactory.mock.resetCalls()
    Feature.mock.resetCalls()
    FeatureCollection.mock.resetCalls()
})

for (const [type, delegatedType, requiredIdMessage] of [
    ['ASSET', 'ASSET', 'ASSET AOI requires a non-blank string ID.'],
    ['RECIPE', 'RECIPE_REF', 'RECIPE AOI requires a non-blank string ID.']
]) {
    describe(`${type} reference AOI`, () => {
        for (const [scenario, id, includeId] of [
            ['an absent ID', undefined, false],
            ['a null ID', null, true],
            ['a blank ID', '', true],
            ['a whitespace-only ID', '   ', true],
            ['a non-string ID', 42, true]
        ]) {
            it(`rejects ${scenario} without constructing an image factory`, async () => {
                const aoi = includeId ? {type, id} : {type}
                let geometry$

                assert.doesNotThrow(() => {
                    geometry$ = toGeometry$(aoi)
                })

                const outcome = await settle(geometry$)
                assert.deepEqual({
                    error: outcome.error?.message,
                    imageFactoryCalls: callsOf(imageFactory)
                }, {
                    error: requiredIdMessage,
                    imageFactoryCalls: []
                })
            })
        }

        it('delegates a valid ID unchanged and emits the resolved geometry', async () => {
            const id = '  users/example/reference  '

            assert.equal(await firstValueFrom(toGeometry$({type, id})), delegatedGeometry)
            assert.equal(imageFactory.mock.callCount(), 1)
            assert.deepEqual(callsOf(imageFactory), [[{type: delegatedType, id}]])
        })
    })
}

describe('null geometry AOI compatibility', () => {
    it('continues emitting null from toGeometry$ without constructing an image factory', async () => {
        assert.equal(await firstValueFrom(toGeometry$(null)), null)
        assert.equal(imageFactory.mock.callCount(), 0)
    })
})

describe('required feature-collection AOI', () => {
    for (const [scenario, aoi] of [
        ['null', null],
        ['undefined', undefined]
    ]) {
        it(
            `rejects ${scenario} without constructing an Earth Engine feature`,
            async () => {
                let featureCollection$

                assert.doesNotThrow(() => {
                    featureCollection$ = toFeatureCollection$(aoi)
                })

                const outcome = await settle(featureCollection$)
                assert.deepEqual({
                    error: outcome.error?.message,
                    featureCalls: callsOf(Feature),
                    featureCollectionCalls: callsOf(FeatureCollection)
                }, {
                    error: 'An AOI is required to create a feature collection.',
                    featureCalls: [],
                    featureCollectionCalls: []
                })
            }
        )
    }

    it('keeps an EE_TABLE as the feature collection itself', async () => {
        const aoi = {type: 'EE_TABLE', id: 'users/example/table'}

        assert.equal(await firstValueFrom(toFeatureCollection$(aoi)), eeTable)
        assert.equal(FeatureCollection.mock.callCount(), 1)
        assert.deepEqual(callsOf(FeatureCollection), [[aoi.id]])
        assert.equal(Feature.mock.callCount(), 0)
    })

    it('wraps a valid non-table geometry in one feature and one feature collection', async () => {
        const featureCollection = await firstValueFrom(toFeatureCollection$({
            type: 'GEOMETRY',
            geometry: runtimeGeometry
        }))
        const feature = Feature.mock.calls[0].result

        assert.equal(Feature.mock.callCount(), 1)
        assert.deepEqual(callsOf(Feature), [[runtimeGeometry]])
        assert.equal(Feature.mock.calls[0].arguments[0], runtimeGeometry)
        assert.equal(FeatureCollection.mock.callCount(), 1)
        assert.deepEqual(callsOf(FeatureCollection), [[[feature]]])
        assert.equal(featureCollection, FeatureCollection.mock.calls[0].result)
    })

    for (const [scenario, aoi, message] of [
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
    ]) {
        it(`does not reclassify ${scenario} as a missing AOI`, async () => {
            await assert.rejects(firstValueFrom(toFeatureCollection$(aoi)), error => error.message.includes(message))
            assert.equal(Feature.mock.callCount(), 0)
            assert.equal(FeatureCollection.mock.callCount(), 0)
        })
    }
})
