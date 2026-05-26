const {EMPTY, of} = require('rxjs')
const {createPendingActions} = require('#mcp/chat/conversation/pendingActions')
const {isChannelEmission} = require('#mcp/chat/channelEvents')

const CONVERSATION_ID = 'conv-1'
const PICKED_AT = '2026-05-26T10:00:00.000Z'

describe('pendingActions store', () => {

    describe('records an active pending action from an observed tool result', () => {

        it('records when update_recipe returns CLARIFICATION_NEEDED carrying a non-empty answer', () => {
            const store = aPendingActions()

            observe(store, anUpdateRecipeClarification())

            expect(store.get(CONVERSATION_ID)).toMatchObject({
                id: 'pa-1',
                conversationId: CONVERSATION_ID,
                toolName: 'update_recipe',
                args: {recipeId: 'r1', instruction: 'use Cloud Score+ instead'},
                question: 'Do you want to add Sentinel-2 to this recipe?',
                createdAt: PICKED_AT,
                status: 'active'
            })
        })

        it('emits a conversation-pending-action-created channel event carrying only id, toolName and question', () => {
            const store = aPendingActions()

            const events = observe(store, anUpdateRecipeClarification())

            expect(events).toHaveLength(1)
            expect(events[0]).toMatchObject({
                kind: 'conversation-pending-action-created',
                payload: {
                    conversationId: CONVERSATION_ID,
                    pendingAction: {id: 'pa-1', toolName: 'update_recipe', question: 'Do you want to add Sentinel-2 to this recipe?'}
                }
            })
            expect(events[0].payload.pendingAction).not.toHaveProperty('args')
            expect(events[0].payload.pendingAction).not.toHaveProperty('createdAt')
            expect(events[0].payload.pendingAction).not.toHaveProperty('status')
        })

        it('ignores a successful update_recipe result', () => {
            const store = aPendingActions()

            const events = observe(store, {
                toolCall: anUpdateRecipeToolCall(),
                result: {ok: true, data: {answer: 'Done.'}}
            })

            expect(events).toEqual([])
            expect(store.get(CONVERSATION_ID)).toBeUndefined()
        })

        it('ignores an update_recipe failure that is not a clarification', () => {
            const store = aPendingActions()

            const events = observe(store, {
                toolCall: anUpdateRecipeToolCall(),
                result: {ok: false, error: {code: 'UPDATE_FAILED', answer: 'It failed.'}}
            })

            expect(events).toEqual([])
            expect(store.get(CONVERSATION_ID)).toBeUndefined()
        })

        it('ignores a clarification-shaped result from any other tool', () => {
            const store = aPendingActions()

            const events = observe(store, {
                toolCall: {id: 't1', name: 'some_other_tool', input: {}},
                result: {ok: false, error: {code: 'CLARIFICATION_NEEDED', answer: 'Which one?'}}
            })

            expect(events).toEqual([])
            expect(store.get(CONVERSATION_ID)).toBeUndefined()
        })

        it('ignores a CLARIFICATION_NEEDED with an empty answer (nothing to show the user)', () => {
            const store = aPendingActions()

            const events = observe(store, {
                toolCall: anUpdateRecipeToolCall(),
                result: {ok: false, error: {code: 'CLARIFICATION_NEEDED', answer: '   '}}
            })

            expect(events).toEqual([])
            expect(store.get(CONVERSATION_ID)).toBeUndefined()
        })
    })

    describe('replacement: one active pending action per conversation', () => {

        it('replaces the existing active pending action when a second clarification arrives', () => {
            const store = aPendingActions({ids: ['pa-1', 'pa-2']})
            observe(store, anUpdateRecipeClarification({question: 'First?'}))

            const events = observe(store, anUpdateRecipeClarification({question: 'Second?'}))

            expect(store.get(CONVERSATION_ID)).toMatchObject({id: 'pa-2', question: 'Second?'})
            expect(events.map(event => event.kind)).toEqual([
                'conversation-pending-action-cleared',
                'conversation-pending-action-created'
            ])
            expect(events[0].payload).toMatchObject({conversationId: CONVERSATION_ID, pendingActionId: 'pa-1', reason: 'replaced'})
            expect(events[1].payload.pendingAction).toMatchObject({id: 'pa-2', question: 'Second?'})
        })
    })

    describe('cancel$', () => {

        it('clears the active pending action and emits a cancelled event', () => {
            const store = aPendingActions()
            observe(store, anUpdateRecipeClarification())

            const events = read(store.cancel$({conversationId: CONVERSATION_ID, pendingActionId: 'pa-1'}))

            expect(store.get(CONVERSATION_ID)).toBeUndefined()
            expect(events).toEqual([{
                kind: 'conversation-pending-action-cleared',
                targeting: 'broadcast',
                payload: {conversationId: CONVERSATION_ID, pendingActionId: 'pa-1', reason: 'cancelled'}
            }])
        })

        it('rejects a cancel for a mismatched id with PENDING_ACTION_NOT_FOUND (targeted) and leaves the active pending in place', () => {
            const store = aPendingActions()
            observe(store, anUpdateRecipeClarification())

            const events = read(store.cancel$({conversationId: CONVERSATION_ID, pendingActionId: 'wrong-id'}))

            expect(store.get(CONVERSATION_ID)).toMatchObject({id: 'pa-1'})
            expect(events).toEqual([{
                kind: 'pending-action-error',
                targeting: 'targeted',
                payload: {conversationId: CONVERSATION_ID, pendingActionId: 'wrong-id', code: 'PENDING_ACTION_NOT_FOUND', message: expect.any(String)}
            }])
        })

        it('rejects a cancel when no pending action exists', () => {
            const store = aPendingActions()

            const events = read(store.cancel$({conversationId: CONVERSATION_ID, pendingActionId: 'pa-1'}))

            expect(events[0]).toMatchObject({kind: 'pending-action-error', payload: {code: 'PENDING_ACTION_NOT_FOUND'}})
        })
    })

    describe('answer$', () => {

        it('clears the active pending action, calls conversation.resumePendingTool$ with augmented instruction, and forwards its events', () => {
            const conversation = aRecordingConversation({events: [emit('chat-response', 'streamed')]})
            const store = aPendingActions({conversations: conversationsFor(conversation)})
            observe(store, anUpdateRecipeClarification())

            const events = read(store.answer$({
                conversationId: CONVERSATION_ID, pendingActionId: 'pa-1', answer: 'Yes, add Sentinel-2'
            }))

            expect(store.get(CONVERSATION_ID)).toBeUndefined()
            expect(conversation.resumeCalls).toHaveLength(1)
            expect(conversation.resumeCalls[0]).toMatchObject({
                userAnswerText: 'Yes, add Sentinel-2',
                toolCall: {
                    name: 'update_recipe',
                    input: {
                        recipeId: 'r1',
                        instruction: expect.stringContaining('use Cloud Score+ instead')
                    }
                }
            })
            expect(conversation.resumeCalls[0].toolCall.input.instruction).toMatch(/Yes, add Sentinel-2/)
            expect(conversation.resumeCalls[0].toolCall.input.instruction).toMatch(/Do you want to add Sentinel-2 to this recipe\?/)
            const cleared = events.find(event => event.kind === 'conversation-pending-action-cleared')
            expect(cleared.payload).toMatchObject({pendingActionId: 'pa-1', reason: 'answered'})
            expect(events.some(event => event.kind === 'chat-response')).toBe(true)
        })

        it('rejects an answer with a mismatched id and does not call conversation.resumePendingTool$', () => {
            const conversation = aRecordingConversation()
            const store = aPendingActions({conversations: conversationsFor(conversation)})
            observe(store, anUpdateRecipeClarification())

            const events = read(store.answer$({
                conversationId: CONVERSATION_ID, pendingActionId: 'wrong-id', answer: 'Yes'
            }))

            expect(conversation.resumeCalls).toEqual([])
            expect(store.get(CONVERSATION_ID)).toMatchObject({id: 'pa-1'})
            expect(events).toEqual([{
                kind: 'pending-action-error',
                targeting: 'targeted',
                payload: {conversationId: CONVERSATION_ID, pendingActionId: 'wrong-id', code: 'PENDING_ACTION_NOT_FOUND', message: expect.any(String)}
            }])
        })

        it('rejects an answer when no pending action exists', () => {
            const conversation = aRecordingConversation()
            const store = aPendingActions({conversations: conversationsFor(conversation)})

            const events = read(store.answer$({
                conversationId: CONVERSATION_ID, pendingActionId: 'pa-1', answer: 'Yes'
            }))

            expect(conversation.resumeCalls).toEqual([])
            expect(events[0]).toMatchObject({kind: 'pending-action-error', payload: {code: 'PENDING_ACTION_NOT_FOUND'}})
        })
    })

    describe('clear', () => {

        it('removes the active pending action without emitting any event (used by conversation deletion)', () => {
            const store = aPendingActions()
            observe(store, anUpdateRecipeClarification())

            store.clear(CONVERSATION_ID)

            expect(store.get(CONVERSATION_ID)).toBeUndefined()
        })

        it('is a no-op when there is no active pending action', () => {
            const store = aPendingActions()

            expect(() => store.clear(CONVERSATION_ID)).not.toThrow()
        })
    })
})

function aPendingActions({
    conversations = conversationsFor(aRecordingConversation()),
    ids = ['pa-1', 'pa-2', 'pa-3'],
    now = PICKED_AT
} = {}) {
    let i = 0
    return createPendingActions({
        conversations,
        createId: () => ids[Math.min(i++, ids.length - 1)],
        clock: {nowIso: () => now}
    })
}

function aRecordingConversation({events = []} = {}) {
    const resumeCalls = []
    return {
        resumeCalls,
        resumePendingTool$(args) {
            resumeCalls.push(args)
            return events.length ? of(...events) : EMPTY
        }
    }
}

function conversationsFor(conversation) {
    return {
        get$: () => of(conversation),
        persistOrTouch$: () => of(true)
    }
}

function anUpdateRecipeToolCall({instruction = 'use Cloud Score+ instead'} = {}) {
    return {id: 'tc-1', name: 'update_recipe', input: {recipeId: 'r1', instruction}}
}

function anUpdateRecipeClarification({
    question = 'Do you want to add Sentinel-2 to this recipe?',
    instruction = 'use Cloud Score+ instead'
} = {}) {
    return {
        toolCall: anUpdateRecipeToolCall({instruction}),
        result: {ok: false, error: {code: 'CLARIFICATION_NEEDED', answer: question}}
    }
}

function observe(store, {toolCall, result}) {
    return read(store.observeToolResult$({conversationId: CONVERSATION_ID, toolCall, result}))
}

function read(observable) {
    const events = []
    observable.subscribe({
        next: value => events.push(isChannelEmission(value) ? value.event : value),
        error: e => { throw e }
    })
    return events
}

function emit(kind, text) {
    return {kind, targeting: 'broadcast', payload: {conversationId: CONVERSATION_ID, text}}
}
