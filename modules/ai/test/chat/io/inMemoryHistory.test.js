const {createInMemoryHistory} = require('#mcp/chat/io/inMemoryHistory')

describe('In-memory history', () => {

    it('returns the appended messages on load', () => {
        const history = createInMemoryHistory()

        append(history, {role: 'user', content: 'first'})
        append(history, {role: 'assistant', content: 'reply'})

        expect(load(history)).toEqual([
            {role: 'user', content: 'first'},
            {role: 'assistant', content: 'reply'}
        ])
    })

    it('starts empty', () => {
        const history = createInMemoryHistory()

        expect(load(history)).toEqual([])
    })
})

function append(history, message) {
    history.append$(message).subscribe({error: e => { throw e }})
}

function load(history) {
    let messages
    history.load$().subscribe({
        next: v => { messages = v },
        error: e => { throw e }
    })
    return messages
}
