import assert from 'node:assert/strict'
import {before, describe, test} from 'node:test'

import ee from '#sepal/ee/ee'

import {initializeOfflineEE} from '../support/eeOffline.js'

before(() => initializeOfflineEE())

describe('building an expression strips own constructor keys from its arguments', () => {
    test('a plain argument loses its own constructor key', () => {
        const namedArgs = {input: ee.Image('asset'), bandSelectors: ['b'], constructor: 'polluted'}

        ee.ApiFunction._apply('Image.select', namedArgs)

        assert.equal(Object.hasOwn(namedArgs, 'constructor'), false)
    })

    test('an expression argument is not walked again', () => {
        const id = {constructor: 'kept'}
        const image = ee.Image(new ee.ComputedObject(ee.ApiFunction.lookup('Image.load'), {id}))

        image.select(['b'])

        assert.equal(Object.hasOwn(id, 'constructor'), true)
    })
})
