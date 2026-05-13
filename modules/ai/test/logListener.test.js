const {createLogListener} = require('#mcp/logListener')

describe('Log listener', () => {

    let lines, listener

    beforeEach(() => {
        lines = []
        const log = (level, line) => lines.push({level, line})
        listener = createLogListener({log})
    })

    it('logs an event\'s message at its declared level', () => {
        listener.onEvent({type: 'wsIn', level: 'info', message: 'WS in c1:s1 (alice) createConversation'})

        expect(lines).toEqual([{level: 'info', line: 'WS in c1:s1 (alice) createConversation'}])
    })

    it('logs warn-level events at warn', () => {
        listener.onEvent({type: 'wsIn', level: 'warn', message: 'WS in c1:s1 (alice) unknown data type: foo (ignored)'})

        expect(lines).toEqual([{level: 'warn', line: 'WS in c1:s1 (alice) unknown data type: foo (ignored)'}])
    })

    it('passes lazy message functions through to the logger', () => {
        const message = () => 'expensive log line'

        listener.onEvent({type: 'debug.payload', level: 'trace', message})

        expect(lines).toEqual([{level: 'trace', line: message}])
    })

    it('logs error-level events at error', () => {
        listener.onEvent({type: 'something.failed', level: 'error', message: 'something failed: boom'})

        expect(lines).toEqual([{level: 'error', line: 'something failed: boom'}])
    })

    it('ignores events without a level or message (e.g. internal-only events)', () => {
        listener.onEvent({type: 'internal'})

        expect(lines).toEqual([])
    })
})
