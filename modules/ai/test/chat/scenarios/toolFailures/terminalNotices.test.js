import {of, throwError} from 'rxjs'

import {aConversationHarness, aUserChatHarness, collect, eventsOfKind, firstValue, run} from '../../harness.js'

const recipeListSchema = {
    name: 'recipe_list',
    description: 'List recipes.',
    parameters: {type: 'object', properties: {}, additionalProperties: true}
}

describe('terminal notices', () => {

    describe('when the same tool fails three times in a row with different inputs', () => {
        const aFailingCall = (id, filter) => ({id, name: 'recipe_list', input: {filter}})

        let harness
        beforeEach(() => {
            harness = aConversationHarness({
                replies: [
                    {toolCalls: [aFailingCall('a', 1)]},
                    {toolCalls: [aFailingCall('b', 2)]},
                    {toolCalls: [aFailingCall('c', 3)]},
                    {text: 'should not be reached'}
                ],
                tools: [{
                    ...recipeListSchema,
                    invoke$: () => throwError(() => new Error('boom'))
                }]
            })
        })

        it('emits a translatable consecutive-failures notice and persists it as the trailing assistant message', async () => {
            const events = await collect(harness.send$('list'))

            const noticeEvent = events.find(event => event.notice)
            expect(noticeEvent.notice.display).toEqual({
                key: 'home.chat.notices.toolConsecutiveFailures',
                args: {tool: 'recipe_list', max: expect.any(Number)},
                fallback: expect.any(String)
            })
            const stored = await firstValue(harness.history.load$())
            expect(stored.at(-1)).toEqual({
                role: 'assistant',
                content: expect.any(String),
                display: noticeEvent.notice.display
            })
        })
    })

    describe('when the same tool returns INVALID_TOOL_ARGS three times in a row', () => {
        const recipeLoadSchema = {
            name: 'recipe_load',
            description: 'Load one recipe.',
            parameters: {type: 'object', properties: {}, additionalProperties: true}
        }

        let harness
        beforeEach(() => {
            harness = aConversationHarness({
                replies: [
                    {toolCalls: [{id: 'a', name: 'recipe_load', input: {x: 1}}]},
                    {toolCalls: [{id: 'b', name: 'recipe_load', input: {x: 2}}]},
                    {toolCalls: [{id: 'c', name: 'recipe_load', input: {x: 3}}]},
                    {text: 'should not be reached'}
                ],
                tools: [{
                    ...recipeLoadSchema,
                    invoke$: () => of({ok: false, error: {code: 'INVALID_TOOL_ARGS', message: 'Bad args'}})
                }]
            })
        })

        it('emits the dedicated invalid-args notice and persists it as the trailing assistant message', async () => {
            const events = await collect(harness.send$('load'))

            const noticeEvent = events.find(event => event.notice)
            expect(noticeEvent.notice.display).toEqual({
                key: 'home.chat.notices.toolInvalidArgs',
                args: {tool: 'recipe_load', max: expect.any(Number)},
                fallback: expect.any(String)
            })
            const stored = await firstValue(harness.history.load$())
            expect(stored.at(-1)).toEqual({
                role: 'assistant',
                content: expect.any(String),
                display: noticeEvent.notice.display
            })
        })
    })

    describe('when the tool loop runs to the round cap', () => {
        const toolCall = {id: 't', name: 'recipe_list', input: {}}

        let harness
        beforeEach(() => {
            harness = aConversationHarness({
                replies: [{toolCalls: [toolCall]}],
                tools: [{
                    ...recipeListSchema,
                    invoke$: () => of({})
                }]
            })
        })

        it('emits a translatable round-cap notice and persists it as the trailing assistant message', async () => {
            const events = await collect(harness.send$('loop forever'))

            const capDisplay = {
                key: 'home.chat.notices.toolRoundCap',
                args: {max: expect.any(Number)},
                fallback: expect.any(String)
            }
            const notice = events.find(event => event.notice).notice
            expect(notice).toEqual({content: notice.display.fallback, display: capDisplay})
            const stored = await firstValue(harness.history.load$())
            expect(stored.at(-1)).toEqual({
                role: 'assistant',
                content: notice.display.fallback,
                display: capDisplay
            })
        })
    })

    describe('when the orchestrator hits the round cap inside a userChat turn', () => {
        const toolCall = {id: 't', name: 'recipe_list', input: {}}

        let harness
        beforeEach(() => {
            harness = aUserChatHarness({
                conversationIds: ['conv-1'],
                replies: [{toolCalls: [toolCall]}],
                tools: [{
                    ...recipeListSchema,
                    invoke$: () => of({})
                }]
            })
        })

        it('broadcasts a round-cap assistant-notice to the user channel', () => {
            run(harness.handle$({type: 'create-conversation'}))
            run(harness.handle$({type: 'message', conversationId: 'conv-1', text: 'spin'}))

            const notices = eventsOfKind(harness.channelEvents, 'assistant-notice')
            const display = {
                key: 'home.chat.notices.toolRoundCap',
                args: {max: expect.any(Number)},
                fallback: expect.any(String)
            }
            expect(notices).toEqual([{
                kind: 'assistant-notice',
                targeting: 'broadcast',
                payload: {
                    conversationId: 'conv-1',
                    content: notices[0]?.payload.display.fallback,
                    display
                }
            }])
        })
    })
})
