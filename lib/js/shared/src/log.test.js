import {configureNoLogging, getLogger} from './log.js'

describe('configureNoLogging', () => {
    it('silences all loggers', () => {
        expect(getLogger('someLogger').isInfo()).toBe(true)
        configureNoLogging()
        expect(getLogger('someLogger').isInfo()).toBe(false)
    })
})
