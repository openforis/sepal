import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import {describe, it} from 'node:test'

import {digestOf} from './digest.js'

describe('an evidence digest', () => {
    it('is the same for the same meaning written in another key order', async () => {
        assert.equal(
            await digestOf({question: {band: 'class', crs: 'EPSG:6933'}, recipes: [{id: 'a', projection: {x: 1, y: 2}}]}),
            await digestOf({recipes: [{projection: {y: 2, x: 1}, id: 'a'}], question: {crs: 'EPSG:6933', band: 'class'}})
        )
    })

    it('differs where array order differs', async () => {
        assert.notEqual(await digestOf({bands: ['a', 'b']}), await digestOf({bands: ['b', 'a']}))
    })

    it('is the SHA-256 hex of the canonical serialization', async () => {
        assert.equal(await digestOf({b: 1, a: [2]}), createHash('sha256').update('{"a":[2],"b":1}').digest('hex'))
    })
})
