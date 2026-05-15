import {useEffect} from 'react'

import {getLogger} from '~/log'

import {handleGuiAction} from './guiActionRegistry'

const log = getLogger('chat')

export const useChatMessageDispatch = ({message$, dispatch, respond}) => {
    useEffect(() => {
        const subscription = message$.subscribe(data => {
            dispatchChatMessage({data, dispatch, respond})
        })
        return () => subscription.unsubscribe()
    }, [message$, dispatch, respond])
}

function dispatchChatMessage({data, dispatch, respond}) {
    const {type, requestId, conversationId} = data
    switch (type) {
        case 'chat-response':
            dispatch({type: 'ASSISTANT_CHUNK', conversationId, text: data.text, complete: data.complete})
            break
        case 'user-message':
            dispatch({type: 'USER_MESSAGE_RECEIVED', conversationId, text: data.text})
            break
        case 'tool-start':
            dispatch({type: 'TOOL_START', conversationId, toolCallId: data.toolCallId, toolName: data.toolName, input: data.input})
            break
        case 'tool-end':
            dispatch({type: 'TOOL_END', conversationId, toolCallId: data.toolCallId, ok: data.ok, data: data.data, error: data.error})
            break
        case 'assistant-notice':
            dispatch({type: 'ASSISTANT_NOTICE', conversationId, content: data.content, display: data.display})
            break
        case 'status':
            dispatch({type: 'STATUS_THINKING', conversationId})
            break
        case 'gui-action':
            handleGuiActionMessage({data, requestId, respond})
            break
        case 'conversations':
            dispatch({type: 'CONVERSATIONS_SET', conversations: data.conversations})
            break
        case 'conversation-created':
            dispatch({type: 'CONVERSATION_CREATED', meta: metaFrom(data)})
            break
        case 'conversation-loaded':
            dispatch({type: 'CONVERSATION_LOADED', conversationId, messages: data.messages})
            break
        case 'conversation-claimed':
            dispatch({type: 'CONVERSATION_CLAIMED', meta: metaFrom(data)})
            break
        case 'conversation-updated':
            dispatch({type: 'CONVERSATION_UPDATED', meta: metaFrom(data)})
            break
        case 'conversation-deleted':
            dispatch({type: 'CONVERSATION_DELETED', conversationId})
            break
        default:
            log.trace('Unhandled chat message type:', type)
    }
}

function handleGuiActionMessage({data, requestId, respond}) {
    const handled = handleGuiAction(data.action, {
        ...(data.params || {}),
        respond: payload => respond(requestId, payload)
    })
    if (!handled) {
        log.warn('Unknown GUI action:', data.action)
        respond(requestId, {success: false, error: `Unknown GUI action: ${data.action}`})
    }
}

const metaFrom = data => ({
    id: data.conversationId,
    title: data.title,
    createdAt: data.createdAt,
    updatedAt: data.updatedAt
})
