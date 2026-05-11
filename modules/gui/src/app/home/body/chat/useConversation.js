import {useReducer} from 'react'

const processLoadedMessages = messages => {
    const result = []
    for (let i = 0; i < messages.length; i++) {
        const m = messages[i]
        if (m.role === 'user') {
            result.push({role: 'user', content: m.content})
        } else if (m.role === 'assistant') {
            let tools
            if (m.toolCalls && m.toolCalls.length > 0) {
                const next = messages[i + 1]
                const resultsById = {}
                if (next && next.role === 'tool' && Array.isArray(next.toolResults)) {
                    for (const tr of next.toolResults) {
                        resultsById[tr.toolCallId] = tr.result
                    }
                }
                tools = m.toolCalls.map(tc => {
                    const res = resultsById[tc.id]
                    const success = res ? res.success !== false : true
                    return {
                        id: tc.id,
                        name: tc.name,
                        input: tc.input || {},
                        status: success ? 'success' : 'error',
                        data: success ? res?.data : undefined,
                        error: success ? undefined : res?.error
                    }
                })
            }
            result.push({role: 'assistant', content: m.content || '', tools})
        }
    }
    return result
}

const initialState = {
    messages: [],
    isLoading: false,
    isThinking: false,
    streaming: false,
    view: 'list',
    activeConversationId: null,
    conversations: []
}

const isForeignConversation = (state, conversationId) =>
    conversationId && state.activeConversationId && conversationId !== state.activeConversationId

const updateLast = (messages, transform) => {
    const last = messages[messages.length - 1]
    if (!last) return messages
    const updated = [...messages]
    updated[updated.length - 1] = transform(last)
    return updated
}

const reducer = (state, action) => {
    switch (action.type) {
        case 'USER_SENT':
            return {
                ...state,
                messages: [...state.messages, {role: 'user', content: action.text}],
                isLoading: true,
                streaming: false
            }
        case 'ASSISTANT_CHUNK': {
            if (isForeignConversation(state, action.conversationId)) return state
            const {text, complete} = action
            let messages = state.messages
            let streaming = state.streaming
            if (text) {
                if (!streaming && !text.trim()) {
                    return state
                }
                // Late chunks arriving after a user-initiated abort would
                // otherwise spawn a fresh assistant message — drop them.
                if (!streaming && !state.isLoading) {
                    return state
                }
                if (!streaming) {
                    messages = [...messages, {role: 'assistant', content: text, streaming: !complete}]
                } else {
                    messages = updateLast(messages, last =>
                        last.streaming
                            ? {...last, content: last.content + text, streaming: !complete}
                            : last
                    )
                }
                streaming = !complete
            } else if (complete) {
                messages = updateLast(messages, last =>
                    last.streaming ? {...last, streaming: false} : last
                )
            }
            return {
                ...state,
                messages,
                isThinking: false,
                streaming: complete ? false : streaming,
                isLoading: complete ? false : state.isLoading
            }
        }
        case 'TOOL_START': {
            if (isForeignConversation(state, action.conversationId)) return state
            const entry = {
                id: action.toolCallId,
                name: action.name,
                input: action.input || {},
                status: 'running'
            }
            const last = state.messages[state.messages.length - 1]
            if (last && last.role === 'assistant') {
                const messages = updateLast(state.messages, m => ({
                    ...m,
                    streaming: false,
                    tools: [...(m.tools || []), entry]
                }))
                return {...state, messages, streaming: false, isThinking: false}
            }
            return {
                ...state,
                messages: [...state.messages, {role: 'assistant', content: '', tools: [entry]}],
                streaming: false,
                isThinking: false
            }
        }
        case 'TOOL_END': {
            if (isForeignConversation(state, action.conversationId)) return state
            const messages = state.messages.map(m => {
                if (!m.tools) return m
                const idx = m.tools.findIndex(t => t.id === action.toolCallId)
                if (idx < 0) return m
                const tools = [...m.tools]
                tools[idx] = {
                    ...tools[idx],
                    status: action.success ? 'success' : 'error',
                    data: action.data,
                    error: action.error
                }
                return {...m, tools}
            })
            return {...state, messages}
        }
        case 'STATUS_THINKING':
            if (isForeignConversation(state, action.conversationId)) return state
            return {...state, isThinking: true, isLoading: true}
        case 'ABORTED': {
            const messages = updateLast(state.messages, last =>
                last.streaming ? {...last, streaming: false} : last
            )
            return {...state, messages, isLoading: false, isThinking: false, streaming: false}
        }
        case 'CONVERSATIONS_SET':
            return {...state, conversations: action.conversations || []}
        case 'CONVERSATION_CREATED':
            return {
                ...state,
                activeConversationId: action.conversationId,
                messages: [],
                streaming: false,
                isLoading: false,
                isThinking: false,
                view: 'chat'
            }
        case 'CONVERSATION_LOADED':
            return {
                ...state,
                activeConversationId: action.conversationId,
                messages: processLoadedMessages(action.messages || []),
                streaming: false,
                isLoading: false,
                isThinking: false,
                view: 'chat'
            }
        case 'CONVERSATION_CLAIMED':
            if (action.conversationId !== state.activeConversationId) return state
            return {
                ...state,
                activeConversationId: null,
                messages: [],
                streaming: false,
                isLoading: false,
                isThinking: false,
                view: 'list'
            }
        case 'SHOW_LIST':
            return {
                ...state,
                view: 'list',
                activeConversationId: state.messages.length === 0 ? null : state.activeConversationId
            }
        case 'RESET_AFTER_DELETE_ACTIVE':
            return {
                ...state,
                activeConversationId: null,
                messages: [],
                streaming: false,
                isLoading: false,
                isThinking: false,
                view: 'list'
            }
        case 'RESET_AFTER_DELETE_ALL':
            return {
                ...state,
                activeConversationId: null,
                messages: [],
                streaming: false,
                isLoading: false,
                isThinking: false
            }
        default:
            return state
    }
}

export const useConversation = () => useReducer(reducer, initialState)
