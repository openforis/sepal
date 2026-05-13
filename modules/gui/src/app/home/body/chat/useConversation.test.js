import {conversationReducer, initialConversationState} from './useConversation'

const firstMeta = {
    id: 'conv-1',
    title: 'First conversation',
    createdAt: '2026-05-13T10:00:00.000Z',
    updatedAt: '2026-05-13T10:00:00.000Z'
}

const secondMeta = {
    id: 'conv-2',
    title: 'Second conversation',
    createdAt: '2026-05-13T10:01:00.000Z',
    updatedAt: '2026-05-13T10:01:00.000Z'
}

it('adds a newly created conversation to the sidebar and makes it active', () => {
    expect(conversationReducer(initialConversationState, {
        type: 'CONVERSATION_CREATED',
        meta: firstMeta
    })).toEqual({
        ...initialConversationState,
        activeConversationId: firstMeta.id,
        conversations: [firstMeta],
        view: 'chat'
    })
})

it('adds a claimed conversation to the sidebar without changing the active chat', () => {
    const state = {
        ...initialConversationState,
        activeConversationId: firstMeta.id,
        conversations: [firstMeta],
        messages: [{role: 'user', content: 'hello'}],
        view: 'chat'
    }

    expect(conversationReducer(state, {
        type: 'CONVERSATION_CLAIMED',
        meta: secondMeta
    })).toEqual({
        ...state,
        conversations: [secondMeta, firstMeta]
    })
})

it('updates existing conversation metadata from a claim', () => {
    const updated = {
        ...firstMeta,
        title: 'Updated title',
        updatedAt: '2026-05-13T10:02:00.000Z'
    }

    expect(conversationReducer({
        ...initialConversationState,
        conversations: [firstMeta]
    }, {
        type: 'CONVERSATION_CLAIMED',
        meta: updated
    }).conversations).toEqual([updated])
})

it('appends a user-message broadcast for the active conversation', () => {
    expect(conversationReducer({
        ...initialConversationState,
        activeConversationId: firstMeta.id,
        conversations: [firstMeta],
        view: 'chat'
    }, {
        type: 'USER_MESSAGE_RECEIVED',
        conversationId: firstMeta.id,
        text: 'hello from another tab'
    })).toEqual({
        ...initialConversationState,
        activeConversationId: firstMeta.id,
        conversations: [firstMeta],
        messages: [{role: 'user', content: 'hello from another tab'}],
        isLoading: true,
        view: 'chat'
    })
})

it('ignores a user-message broadcast for an inactive conversation', () => {
    const state = {
        ...initialConversationState,
        activeConversationId: secondMeta.id,
        conversations: [firstMeta, secondMeta],
        messages: [{role: 'user', content: 'current conversation'}],
        view: 'chat'
    }

    expect(conversationReducer(state, {
        type: 'USER_MESSAGE_RECEIVED',
        conversationId: firstMeta.id,
        text: 'hello from another tab'
    })).toBe(state)
})

it('removes a deleted active conversation and returns to the list', () => {
    expect(conversationReducer({
        ...initialConversationState,
        activeConversationId: firstMeta.id,
        conversations: [firstMeta, secondMeta],
        messages: [{role: 'user', content: 'hello'}],
        streaming: true,
        isLoading: true,
        isThinking: true,
        view: 'chat'
    }, {
        type: 'CONVERSATION_DELETED',
        conversationId: firstMeta.id
    })).toEqual({
        ...initialConversationState,
        conversations: [secondMeta],
        view: 'list'
    })
})
