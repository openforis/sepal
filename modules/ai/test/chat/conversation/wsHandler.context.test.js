const {EMPTY, Subject, of} = require('rxjs')
const {createWsHandler} = require('#mcp/chat/conversation/wsHandler')
const {alice, aNoopBus} = require('./wsHandlerHarness')

describe('Chat WS handler — GUI context state', () => {

    it('routes a context message to updateContext$ with the subscription identity', () => {
        const updates = []
        const userChat = {
            listConversations$: () => of(undefined),
            updateContext$: args => { updates.push(args); return EMPTY }
        }
        const handler = createWsHandler({bus: aNoopBus(), userChatFor: () => userChat})
        const arg$ = new Subject()
        handler({arg$}).subscribe()

        arg$.next({event: 'subscriptionUp', ...alice})
        arg$.next({data: {type: 'context', selection: {section: 'process'}}, ...alice})

        expect(updates).toEqual([
            {clientId: 'c1', subscriptionId: 's1', selection: {section: 'process'}}
        ])
    })

    it('clears the stored context on subscriptionDown', () => {
        const clears = []
        const userChat = {
            listConversations$: () => of(undefined),
            clearContext$: args => { clears.push(args); return EMPTY }
        }
        const handler = createWsHandler({bus: aNoopBus(), userChatFor: () => userChat})
        const arg$ = new Subject()
        handler({arg$}).subscribe()

        arg$.next({event: 'subscriptionUp', ...alice})
        arg$.next({event: 'subscriptionDown', ...alice})

        expect(clears).toEqual([{clientId: 'c1', subscriptionId: 's1'}])
    })
})
