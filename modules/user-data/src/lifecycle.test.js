import {Attachments} from './attachments.js'
import {Lifecycle} from './lifecycle.js'

it('erases the Data of a purged user and records it as empty', async () => {
    const calls = []
    const lifecycle = new Lifecycle({
        attachments: new Attachments({bucket: 'b'}),
        providers: {for: () => ({erase: async ({owner}) => calls.push(['erase', owner])})},
        usage: {recordErased: async username => calls.push(['recordErased', username])}
    })

    await lifecycle.onUserStorageErased({username: 'alice'})

    expect(calls).toEqual([['erase', 'alice'], ['recordErased', 'alice']])
})
