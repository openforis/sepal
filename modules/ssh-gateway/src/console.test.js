import {jest} from '@jest/globals'

import {closeConsole, prompt, readLine$} from './console.js'

// The shared readline interface reads process.stdin; emitting 'data' drives its
// line parser synchronously, so prompts can be tested without a real terminal.
describe('readLine$', () => {
    afterAll(() => closeConsole())

    it('delivers input to sequential prompts (menu → confirmation regression)', () => {
        const received = []
        readLine$().subscribe(line => {
            received.push(`first:${line}`)
            // subscribing the next prompt inside the previous prompt's handler is
            // exactly what interactive.js does (stop → y/N confirmation); with
            // per-prompt readline interfaces this second prompt never fired
            readLine$().subscribe(line2 => received.push(`second:${line2}`))
        })
        process.stdin.emit('data', '1s\n')
        process.stdin.emit('data', 'y\n')
        expect(received).toEqual(['first:1s', 'second:y'])
    })

    it('releases the prompt when unsubscribed before any input (race loser)', () => {
        const received = []
        const subscription = readLine$().subscribe(line => received.push(line))
        subscription.unsubscribe()
        process.stdin.emit('data', 'ignored\n')
        expect(received).toEqual([])
    })
})

describe('prompt', () => {
    afterAll(() => closeConsole())

    it('renders the prompt text through readline', () => {
        const writes = []
        const spy = jest.spyOn(process.stdout, 'write').mockImplementation(chunk => {
            writes.push(String(chunk))
            return true
        })
        prompt('Select (1): ')
        spy.mockRestore()
        expect(writes.join('')).toContain('Select (1): ')
    })
})
