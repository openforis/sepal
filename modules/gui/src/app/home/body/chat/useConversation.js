import {useReducer} from 'react'

const processLoadedMessages = messages => {
    const result = []
    for (const m of messages) {
        if (m.role === 'user') {
            result.push(m)
        } else if (m.role === 'assistant') {
            const tools = m.toolCalls && m.toolCalls.length > 0
                ? m.toolCalls.map(tc => tc.name)
                : undefined
            result.push({role: 'assistant', content: m.content || '', tools})
        }
        // tool-role messages are surfaced via the preceding assistant's toolCalls
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
        case 'TOOL_USE': {
            if (isForeignConversation(state, action.conversationId)) return state
            const tools = action.tools || []
            if (state.streaming) {
                const messages = updateLast(state.messages, last =>
                    last.role === 'assistant' ? {...last, streaming: false, tools} : last
                )
                return {...state, messages, streaming: false, isThinking: false}
            }
            return {
                ...state,
                messages: [...state.messages, {role: 'assistant', content: '', tools}],
                isThinking: false
            }
        }
        case 'STATUS_THINKING':
            if (isForeignConversation(state, action.conversationId)) return state
            return {...state, isThinking: true, isLoading: true}
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
