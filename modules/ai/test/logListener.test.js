const {onEvent} = require('#mcp/logListener')

describe('Log listener', () => {

    let lines, log

    beforeEach(() => {
        lines = []
        log = {
            info: line => lines.push({level: 'info', line}),
            warn: line => lines.push({level: 'warn', line}),
            error: line => lines.push({level: 'error', line}),
            trace: line => lines.push({level: 'trace', line})
        }
    })

    it('logs an event\'s message at its declared level', () => {
        onEvent(log, {type: 'wsIn', level: 'info', message: 'WS in c1:s1 (alice) createConversation'})

        expect(lines).toEqual([{level: 'info', line: 'WS in c1:s1 (alice) createConversation'}])
    })

    it('logs warn-level events at warn', () => {
        onEvent(log, {type: 'wsIn', level: 'warn', message: 'WS in c1:s1 (alice) unknown data type: foo (ignored)'})

        expect(lines).toEqual([{level: 'warn', line: 'WS in c1:s1 (alice) unknown data type: foo (ignored)'}])
    })

    it('passes lazy message functions through to the logger', () => {
        const message = () => 'expensive log line'

        onEvent(log, {type: 'debug.payload', level: 'trace', message})

        expect(lines).toEqual([{level: 'trace', line: message}])
    })

    it('logs error-level events at error', () => {
        onEvent(log, {type: 'something.failed', level: 'error', message: 'something failed: boom'})

        expect(lines).toEqual([{level: 'error', line: 'something failed: boom'}])
    })

    it('ignores events without a level or message (e.g. internal-only events)', () => {
        onEvent(log, {type: 'internal'})

        expect(lines).toEqual([])
    })
})
