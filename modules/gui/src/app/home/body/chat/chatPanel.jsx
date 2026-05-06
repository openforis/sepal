import PropTypes from 'prop-types'
import {useCallback, useEffect, useRef} from 'react'

import {getLogger} from '~/log'
import {msg} from '~/translate'
import {Button} from '~/widget/button'
import {ButtonGroup} from '~/widget/buttonGroup'
import {Layout} from '~/widget/layout'
import {RemoveButton} from '~/widget/removeButton'

import {handleChatGuiAction} from './chatGuiActionRegistry'
import {ChatInput} from './chatInput'
import {ChatMessages} from './chatMessages'
import styles from './chatPanel.module.css'
import {ConversationList} from './conversationList'
import {useChatWebSocket} from './useChatWebSocket'
import {useConversation} from './useConversation'

const log = getLogger('chat')

export const ChatPanel = ({className, isOpen, mode = 'overlay', onClose, onToggleMode}) => {
    const {isConnected, send, respond, message$} = useChatWebSocket()
    const [state, dispatch] = useConversation()
    const {messages, isLoading, isThinking, view, conversations, activeConversationId} = state

    const activeConversationIdRef = useRef(activeConversationId)
    activeConversationIdRef.current = activeConversationId

    useEffect(() => {
        const subscription = message$.subscribe(data => {
            const {type, requestId, conversationId} = data
            switch (type) {
                case 'chat-response':
                    dispatch({type: 'ASSISTANT_CHUNK', conversationId, text: data.text, complete: data.complete})
                    break
                case 'tool-use':
                    dispatch({type: 'TOOL_USE', conversationId, tools: data.tools})
                    break
                case 'status':
                    dispatch({type: 'STATUS_THINKING', conversationId})
                    break
                case 'gui-action': {
                    const handled = handleChatGuiAction(data.action, {
                        ...data,
                        respond: payload => respond(requestId, payload)
                    })
                    if (!handled) {
                        log.warn('Unknown GUI action:', data.action)
                        respond(requestId, {success: false, error: `Unknown GUI action: ${data.action}`})
                    }
                    break
                }
                case 'conversations':
                    dispatch({type: 'CONVERSATIONS_SET', conversations: data.conversations})
                    break
                case 'conversation-created':
                    dispatch({type: 'CONVERSATION_CREATED', conversationId})
                    break
                case 'conversation-loaded':
                    dispatch({type: 'CONVERSATION_LOADED', conversationId, messages: data.messages})
                    break
                case 'conversation-claimed':
                    if (conversationId === activeConversationIdRef.current) {
                        dispatch({type: 'CONVERSATION_CLAIMED', conversationId})
                        send({type: 'list-conversations'})
                    }
                    break
                default:
                    log.trace('Unhandled chat message type:', type)
            }
        })
        return () => subscription.unsubscribe()
    }, [message$, dispatch, respond, send])

    const handleSend = useCallback(text => {
        if (isConnected && activeConversationId) {
            dispatch({type: 'USER_SENT', text})
            send({type: 'message', text})
        }
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

    const isSplit = mode === 'split'
    const isConversation = view === 'chat' && activeConversationId

    const renderConversationToolbar = () => (
        <ButtonGroup layout='horizontal-nowrap' spacing='tight'>
            <Button
                chromeless
                shape='circle'
                icon={'arrow-left'}
                tooltip={msg(view === 'chat' ? 'home.sections.chat.showConversations' : 'home.sections.chat.showChat')}
                tooltipPlacement='bottom'
                onClick={handleShowList}
            />
            <RemoveButton
                chromeless
                shape='circle'
                icon='trash'
                tooltip={msg('home.sections.chat.deleteConversation')}
                tooltipPlacement='bottom'
                disabled={!isConnected || isLoading}
                onRemove={handleDeleteActiveConversation}
            />
        </ButtonGroup>
    )

    const renderConversationListToolbar = () => (
        <ButtonGroup layout='horizontal-nowrap' spacing='tight'>
            <Button
                chromeless
                shape='circle'
                icon='plus'
                tooltip={msg('home.sections.chat.newConversation')}
                tooltipPlacement='bottom'
                disabled={!isConnected || (activeConversationId && messages.length === 0)}
                onClick={handleNewConversation}
            />
            <RemoveButton
                chromeless
                shape='circle'
                icon='trash'
                tooltip={msg('home.sections.chat.deleteAllConversations.tooltip')}
                tooltipPlacement='bottom'
                disabled={!isConnected || isLoading}
                title={msg('home.sections.chat.deleteAllConversations.title')}
                message={msg('home.sections.chat.deleteAllConversations.message')}
                noClickHold
                onRemove={handleDeleteAllConversations}
            />
        </ButtonGroup>
    )

    const renderPanelToolbar = () => (
        <ButtonGroup layout='horizontal-nowrap' spacing='tight'>
            <Button
                chromeless
                shape='circle'
                icon={isSplit ? 'thumbtack-slash' : 'thumbtack'}
                tooltip={msg(isSplit ? 'home.sections.chat.floating' : 'home.sections.chat.sticky')}
                tooltipPlacement='bottom'
                onClick={onToggleMode}
            />
            <Button
                chromeless
                shape='circle'
                icon='times'
                tooltip={msg('home.sections.chat.close')}
                tooltipPlacement='bottomRight'
                onClick={onClose}
            />
        </ButtonGroup>
    )

    const renderHeader = () => (
        <Layout className={styles.header} type='horizontal-nowrap'>
            {isConversation ? renderConversationToolbar() : renderConversationListToolbar()}
            <span className={styles.title}>{msg('home.sections.chat.title')}</span>
            {renderPanelToolbar()}
        </Layout>
    )

    const renderConversationList = () => (
        <ConversationList
            conversations={conversations}
            activeConversationId={activeConversationId}
            onSelect={handleSelectConversation}
            onRemove={handleDeleteConversation}
        />
    )

    const renderConversation = () => (
        <>
            <ChatMessages messages={messages} thinking={isThinking}/>
            <ChatInput key={activeConversationId} onSend={handleSend} disabled={isLoading || !isConnected || !activeConversationId}/>
        </>
    )

    return isOpen ? (
        <div className={[
            isSplit ? styles.split : styles.panel,
            className
        ].join(' ')}>
            {renderHeader()}
            {isConversation ? renderConversation() : renderConversationList()}
        </div>
    ) : null
}

ChatPanel.propTypes = {
    className: PropTypes.string,
    isOpen: PropTypes.bool.isRequired,
    mode: PropTypes.oneOf(['overlay', 'split']),
    onClose: PropTypes.func.isRequired,
    onToggleMode: PropTypes.func.isRequired
}
