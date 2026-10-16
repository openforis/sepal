import assert from 'node:assert/strict'
import {describe, it} from 'node:test'

import {requiresTempAssets, retrieveCapabilityError} from '#sepal/recipe/samplingDesign/retrieveCapability'

const model = ({skip, arrangementStrategy}) => ({
    stratification: {skip},
    sampleArrangement: {arrangementStrategy}
})

describe('requiresTempAssets four-mode matrix', () => {
    it('is false only for unstratified Random', () => {
        assert.equal(
            requiresTempAssets(model({skip: true, arrangementStrategy: 'RANDOM'})),
            false
        )
    })

    it('is true for stratified Random and both Systematic modes', () => {
        assert.equal(
            requiresTempAssets(model({skip: false, arrangementStrategy: 'RANDOM'})),
            true
        )
        assert.equal(
            requiresTempAssets(model({skip: true, arrangementStrategy: 'SYSTEMATIC'})),
            true
        )
        assert.equal(
            requiresTempAssets(model({skip: false, arrangementStrategy: 'SYSTEMATIC'})),
            true
        )
    })

    it('recognizes both skip representations for unstratified Random', () => {
        assert.equal(
            requiresTempAssets(model({skip: true, arrangementStrategy: 'RANDOM'})),
            false
        )
        assert.equal(
            requiresTempAssets(model({skip: [true], arrangementStrategy: 'RANDOM'})),
            false
        )
    })

    it('treats false, [] and absent skip as stratified (temp assets required)', () => {
        assert.equal(
            requiresTempAssets(model({skip: false, arrangementStrategy: 'RANDOM'})),
            true
        )
        assert.equal(requiresTempAssets(model({skip: [], arrangementStrategy: 'RANDOM'})), true)
        assert.equal(
            requiresTempAssets({sampleArrangement: {arrangementStrategy: 'RANDOM'}}),
            true
        )
    })
})

describe('retrieveCapabilityError', () => {
    const unstratifiedRandom = model({skip: true, arrangementStrategy: 'RANDOM'})
    const stratifiedRandom = model({skip: false, arrangementStrategy: 'RANDOM'})
    const unstratifiedSystematic = model({skip: true, arrangementStrategy: 'SYSTEMATIC'})
    const stratifiedSystematic = model({skip: false, arrangementStrategy: 'SYSTEMATIC'})

    it('never blocks unstratified Random - even for a service account with no roots', () => {
        assert.equal(
            retrieveCapabilityError({model: unstratifiedRandom, googleAccount: false, assetRoots: undefined}),
            null
        )
        assert.equal(
            retrieveCapabilityError({model: unstratifiedRandom, googleAccount: false, assetRoots: []}),
            null
        )
    })

    it('blocks every temp-asset design with no linked account', () => {
        for (const m of [stratifiedRandom, unstratifiedSystematic, stratifiedSystematic]) {
            assert.deepEqual(
                retrieveCapabilityError({model: m, googleAccount: false, assetRoots: undefined}),
                {code: 'noAccount'}
            )
        }
    })

    it('allows a temp-asset design with a linked account and a loaded, non-empty root list', () => {
        assert.equal(
            retrieveCapabilityError({model: stratifiedRandom, googleAccount: true, assetRoots: ['users/me']}),
            null
        )
        assert.equal(
            retrieveCapabilityError({model: stratifiedSystematic, googleAccount: true, assetRoots: ['users/me']}),
            null
        )
    })

    it('blocks a temp-asset design when the linked account has a loaded empty root list', () => {
        assert.deepEqual(
            retrieveCapabilityError({model: stratifiedRandom, googleAccount: true, assetRoots: []}),
            {code: 'noAssetRoot'}
        )
    })

    it('blocks a temp-asset design with a distinct pending state while roots are unresolved (not noAssetRoot)', () => {
        assert.deepEqual(
            retrieveCapabilityError({model: stratifiedRandom, googleAccount: true, assetRoots: undefined}),
            {code: 'pending'}
        )
    })
})
