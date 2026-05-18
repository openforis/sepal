const {EMPTY, Subject, of} = require('rxjs')
const {createWsHandler} = require('#mcp/chat/conversation/wsHandler')
const {alice, aNoopBus} = require('./wsHandlerHarness')

describe('Chat WS handler — GUI context state', () => {

    it('forwards a context message to userChat.handle$ with the subscription identity', () => {
        const handled = []
        const userChat = {
            handle$: args => { handled.push(args); return EMPTY }
        }
        const handler = createWsHandler({bus: aNoopBus(), userChatFor: () => userChat})
        const arg$ = new Subject()
        handler({arg$}).subscribe()

        arg$.next({event: 'subscriptionUp', ...alice})
        arg$.next({data: {type: 'context', selection: {section: 'process'}}, ...alice})

        expect(handled).toContainEqual(
            expect.objectContaining({
                type: 'context',
                clientId: 'c1',
                subscriptionId: 's1',
                selection: {section: 'process'}
            })
        )
    })

    it('routes a clear-context command to userChat.handle$ on subscriptionDown', () => {
        const handled = []
        const userChat = {
            handle$: args => { handled.push(args); return EMPTY }
        }
        const handler = createWsHandler({bus: aNoopBus(), userChatFor: () => userChat})
        const arg$ = new Subject()
        handler({arg$}).subscribe()

        arg$.next({event: 'subscriptionUp', ...alice})
        arg$.next({event: 'subscriptionDown', ...alice})

        expect(handled).toContainEqual(
            expect.objectContaining({type: 'clear-context', clientId: 'c1', subscriptionId: 's1'})
        )
    })
})
