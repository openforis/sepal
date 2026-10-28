import assert from 'node:assert/strict'
import {describe, it} from 'node:test'

import {OPTICAL_COLLECTION_DEFAULTS} from '#sepal/recipe/capability/opticalCollectionDefaults'
import {MALFORMED, PRESERVES, PRODUCES, providerStep, UNSUPPORTED} from '#sepal/recipe/capability/providerStep'

// Which types state an optical collection configuration a consumer can copy defaults from.
//
// Declaring none says nothing about whether a source can be used: it says the consumer has nothing to
// fill its own panels from and the user configures it by hand.

describe('one step from a record towards the producer', () => {
    it('stops at an optical mosaic, which states its configuration in its own model', () => {
        const {status, declared} = step({type: 'MOSAIC', model: {}})

        assert.equal(status, PRODUCES)
        assert.equal(declared.defaultsAsset({}), null)
    })

    it('stops at an asset mosaic, which names where its configuration was exported', () => {
        const model = {assetDetails: {assetId: 'users/x/mosaic'}}
        const {status, declared} = step({type: 'ASSET_MOSAIC', model})

        assert.equal(status, PRODUCES)
        assert.equal(declared.defaultsAsset(model), 'users/x/mosaic')
    })

    it('follows the input a preserving record stands for', () => {
        const {status, reference} = step({
            type: 'MASKING',
            model: {imageToMask: {type: 'RECIPE_REF', id: 'mosaic-1'}}
        })

        assert.equal(status, PRESERVES)
        assert.deepEqual(reference, {type: 'RECIPE_REF', id: 'mosaic-1'})
    })

    it('reports a terminal recipe that states none', () => {
        assert.equal(step({type: 'RADAR_MOSAIC', model: {}}).status, UNSUPPORTED)
    })

    it('reports a preserving role its model does not fill', () => {
        assert.equal(step({type: 'MASKING', model: {}}).status, MALFORMED)
    })
})

const step = record => providerStep(record, OPTICAL_COLLECTION_DEFAULTS)
