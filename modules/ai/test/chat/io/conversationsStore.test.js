const {createInMemoryConversationsStore} = require('#mcp/chat/io/conversationsStore')

describe('In-memory ConversationsStore adapter', () => {

    const aMeta = (id, t = 't1') => ({id, title: '', createdAt: t, updatedAt: t})

    it('stores meta records and returns them in insertion order', () => {
        const store = createInMemoryConversationsStore()
        store.add(aMeta('a', 't1'))
        store.add(aMeta('b', 't2'))

        expect(store.list()).toEqual([aMeta('a', 't1'), aMeta('b', 't2')])
    })

    it('looks up meta by id', () => {
        const store = createInMemoryConversationsStore()
        store.add(aMeta('a'))

        expect(store.get('a')).toEqual(aMeta('a'))
        expect(store.get('nope')).toBeUndefined()
    })

    it('updates updatedAt on touch and reports whether the record existed', () => {
        const store = createInMemoryConversationsStore()
        store.add(aMeta('a', 't1'))

        expect(store.touch('a', 't2')).toBe(true)
        expect(store.get('a').updatedAt).toBe('t2')
        expect(store.touch('nope', 't2')).toBe(false)
    })

    it('removes records on delete and reports whether removal happened', () => {
        const store = createInMemoryConversationsStore()
        store.add(aMeta('a'))

        expect(store.delete('a')).toBe(true)
        expect(store.delete('a')).toBe(false)
        expect(store.list()).toEqual([])
    })
})
