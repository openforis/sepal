import assert from 'node:assert/strict'
import {describe, it} from 'node:test'

import {configureNoLogging, getLogger} from './log.js'

describe('configureNoLogging', () => {
    it('silences all loggers', () => {
        assert.equal(getLogger('someLogger').isInfo(), true)
        configureNoLogging()
        assert.equal(getLogger('someLogger').isInfo(), false)
    })
})
