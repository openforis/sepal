import {useCallback} from 'react'

import {currentSelection} from './chatSelection'

export const useChatCommands = ({isConnected, activeConversationId, send, dispatch}) => {
    const handleSend = useCallback(text => {
        if (isConnected && activeConversationId) {
            dispatch({type: 'USER_SENT', text})
            send({type: 'message', conversationId: activeConversationId, text, selection: currentSelection()})
        }
    }, [dispatch, send, isConnected, activeConversationId])

    const handleStop = useCallback(() => {
        if (isConnected && activeConversationId) {
            send({type: 'abort', conversationId: activeConversationId})
        }
        dispatch({type: 'ABORTED'})
    }, [dispatch, send, isConnected, activeConversationId])

    const handleNewConversation = useCallback(() => {
        if (isConnected) {
            send({type: 'create-conversation'})
        }
    }, [send, isConnected])

    const handleSelectConversation = useCallback(conversationId => {
        if (isConnected) {
            send({type: 'select-conversation', conversationId})
        }
    }, [send, isConnected])

    const handleDeleteConversation = useCallback(conversationId => {
        if (isConnected) {
            send({type: 'delete-conversation', conversationId})
        }
    }, [send, isConnected])

    const handleDeleteActiveConversation = useCallback(() => {
        if (!activeConversationId) return
        handleDeleteConversation(activeConversationId)
        dispatch({type: 'RESET_AFTER_DELETE_ACTIVE'})
        if (isConnected) {
            send({type: 'list-conversations'})
        }
    }, [activeConversationId, handleDeleteConversation, dispatch, send, isConnected])

    const handleDeleteAllConversations = useCallback(() => {
        if (isConnected) {
            send({type: 'delete-all-conversations'})
            dispatch({type: 'RESET_AFTER_DELETE_ALL'})
        }
    }, [send, dispatch, isConnected])

    const handleShowList = useCallback(() => {
        dispatch({type: 'SHOW_LIST'})
        if (isConnected) {
            send({type: 'list-conversations'})
        }
    }, [dispatch, send, isConnected])

    return {
        handleSend,
        handleStop,
        handleNewConversation,
        handleSelectConversation,
        handleDeleteConversation,
        handleDeleteActiveConversation,
        handleDeleteAllConversations,
        handleShowList
    }
}
