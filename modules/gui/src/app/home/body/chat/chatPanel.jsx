import PropTypes from 'prop-types'
import {useCallback, useEffect, useRef} from 'react'
import {useSelector} from 'react-redux'
import {useLocation} from 'react-router-dom'

import {actionBuilder} from '~/action-builder'
import {getLogger} from '~/log'
import {select} from '~/store'
import {msg} from '~/translate'
import {Button} from '~/widget/button'
import {ButtonGroup} from '~/widget/buttonGroup'
import {Layout} from '~/widget/layout'
import {RemoveButton} from '~/widget/removeButton'

import {ChatInput} from './chatInput'
import {ChatMessages} from './chatMessages'
import styles from './chatPanel.module.css'
import {currentSelection} from './chatSelection'
import {ConversationList} from './conversationList'
import {handleGuiAction} from './guiActionRegistry'
import {useChatWebSocket} from './useChatWebSocket'
import {useConversation} from './useConversation'

const log = getLogger('chat')

const CHAT_MODE_STORAGE_KEY = 'ChatMode'
const CHAT_MODE_SPLIT = 'split'
const CHAT_MODE_OVERLAY = 'overlay'

const CHAT_WIDTH_STORAGE_KEY = 'ChatWidth'
const DEFAULT_CHAT_WIDTH = 400
const MIN_CHAT_WIDTH = 280
const MAX_CHAT_WIDTH_RATIO = 0.8

const loadStoredChatMode = () => {
    const stored = localStorage.getItem(CHAT_MODE_STORAGE_KEY)
    return stored === CHAT_MODE_SPLIT || stored === CHAT_MODE_OVERLAY ? stored : CHAT_MODE_OVERLAY
}

const loadStoredChatWidth = () => {
    const stored = parseInt(localStorage.getItem(CHAT_WIDTH_STORAGE_KEY), 10)
    return Number.isFinite(stored) && stored >= MIN_CHAT_WIDTH ? stored : DEFAULT_CHAT_WIDTH
}

const clampChatWidth = width => {
    const max = Math.max(MIN_CHAT_WIDTH, Math.floor(window.innerWidth * MAX_CHAT_WIDTH_RATIO))
    return Math.min(Math.max(Math.round(width), MIN_CHAT_WIDTH), max)
}

export const isChatOpen = () => !!select('chat.open')
export const getChatMode = () => select('chat.mode') || loadStoredChatMode()
export const isChatSplit = () => isChatOpen() && getChatMode() === CHAT_MODE_SPLIT
export const getChatWidth = () => select('chat.width') ?? loadStoredChatWidth()

const setChatWidth = width => {
    const clamped = clampChatWidth(width)
    actionBuilder('SET_CHAT_WIDTH')
        .set('chat.width', clamped)
        .dispatch()
}

const storeChatWidth = () => {
    localStorage.setItem(CHAT_WIDTH_STORAGE_KEY, String(getChatWidth()))
}

export const toggleChat = () =>
    actionBuilder('TOGGLE_CHAT')
        .set('chat.open', !isChatOpen())
        .dispatch()

const closeChat = () =>
    actionBuilder('CLOSE_CHAT')
        .set('chat.open', false)
        .dispatch()

const toggleChatMode = () => {
    const mode = getChatMode() === CHAT_MODE_OVERLAY ? CHAT_MODE_SPLIT : CHAT_MODE_OVERLAY
    localStorage.setItem(CHAT_MODE_STORAGE_KEY, mode)
    actionBuilder('TOGGLE_CHAT_MODE')
        .set('chat.mode', mode)
        .dispatch()
}

export const ChatPanel = ({className}) => {
    const isOpen = useSelector(() => isChatOpen())
    const mode = useSelector(() => getChatMode())
    const isSplit = mode === CHAT_MODE_SPLIT

    const handleResizeStart = useCallback(event => {
        event.preventDefault()
        const startX = event.clientX
        const startWidth = getChatWidth()
        const onPointerMove = e => {
            setChatWidth(startWidth + (startX - e.clientX))
        }
        const onPointerUp = () => {
            stopResize()
            storeChatWidth()
        }
        const startResize = () => {
            document.body.style.userSelect = 'none'
            document.body.style.cursor = 'col-resize'
            window.addEventListener('pointermove', onPointerMove)
            window.addEventListener('pointerup', onPointerUp)
        }
        const stopResize = () => {
            window.removeEventListener('pointermove', onPointerMove)
            window.removeEventListener('pointerup', onPointerUp)
            document.body.style.userSelect = ''
            document.body.style.cursor = ''
        }
        startResize()
    }, [])

    const {isConnected, send, respond, message$} = useChatWebSocket()
    const [state, dispatch] = useConversation()
    const {messages, isLoading, isThinking, view, conversations, activeConversationId} = state

    // Subscribe so the panel re-renders when the formatter lazy-loads recipes/projects
    useSelector(() => select('process.recipes'))
    useSelector(() => select('process.projects'))

    // Subscribe to selection-relevant slices and the route. Whenever any of
    // these change, the effect below recomputes currentSelection() and pushes
    // a {type: 'context'} message to the AI module so the LLM's system prompt
    // reflects the user's current GUI state at every tool-call round.
    useSelector(() => select('process.tabs'))
    useSelector(() => select('process.selectedTabId'))
    useSelector(() => select('process.projectId'))
    useSelector(() => select('process.loadedRecipes'))
    useSelector(() => select('apps.tabs'))
    useSelector(() => select('apps.selectedTabId'))
    useLocation()

    const lastContextRef = useRef(null)
    const contextDebounceRef = useRef(null)

    // When the WS drops, the AI module's session selection is gone (per-conn
    // state). Clear our last-sent marker so the next time we're connected we
    // unconditionally re-send the current selection.
    useEffect(() => {
        if (!isConnected) lastContextRef.current = null
    }, [isConnected])

    useEffect(() => {
        if (!isConnected) return
        if (contextDebounceRef.current) clearTimeout(contextDebounceRef.current)
        contextDebounceRef.current = setTimeout(() => {
            const selection = currentSelection()
            const key = JSON.stringify(selection)
            if (key !== lastContextRef.current) {
                lastContextRef.current = key
                send({type: 'context', selection})
            }
        }, 200)
        return () => {
            if (contextDebounceRef.current) clearTimeout(contextDebounceRef.current)
        }
    })

    const activeConversationIdRef = useRef(activeConversationId)
    activeConversationIdRef.current = activeConversationId

    useEffect(() => {
        const subscription = message$.subscribe(data => {
            const {type, requestId, conversationId} = data
            switch (type) {
                case 'chat-response':
                    dispatch({type: 'ASSISTANT_CHUNK', conversationId, text: data.text, complete: data.complete})
                    break
                case 'tool-start':
                    dispatch({type: 'TOOL_START', conversationId, toolCallId: data.toolCallId, name: data.name, input: data.input})
                    break
                case 'tool-end':
                    dispatch({type: 'TOOL_END', conversationId, toolCallId: data.toolCallId, success: data.success, data: data.data, error: data.error})
                    break
                case 'status':
                    dispatch({type: 'STATUS_THINKING', conversationId})
                    break
                case 'gui-action': {
                    const handled = handleGuiAction(data.action, {
                        ...(data.params || {}),
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
            send({type: 'message', text, selection: currentSelection()})
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

    const isConversation = view === 'chat' && activeConversationId

    const renderConversationToolbar = () => (
        <ButtonGroup layout='horizontal-nowrap' spacing='tight'>
            <Button
                chromeless
                shape='circle'
                icon={'arrow-left'}
                tooltip={msg(view === 'chat' ? 'home.chat.showConversations' : 'home.chat.showChat')}
                tooltipPlacement='bottom'
                onClick={handleShowList}
            />
            <RemoveButton
                chromeless
                shape='circle'
                icon='trash'
                tooltip={msg('home.chat.deleteConversation')}
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
                tooltip={msg('home.chat.newConversation')}
                tooltipPlacement='bottom'
                disabled={!isConnected || (activeConversationId && messages.length === 0)}
                onClick={handleNewConversation}
            />
            <RemoveButton
                chromeless
                shape='circle'
                icon='trash'
                tooltip={msg('home.chat.deleteAllConversations.tooltip')}
                tooltipPlacement='bottom'
                disabled={!isConnected || isLoading}
                title={msg('home.chat.deleteAllConversations.title')}
                message={msg('home.chat.deleteAllConversations.message')}
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
                tooltip={msg(isSplit ? 'home.chat.floating' : 'home.chat.sticky')}
                tooltipPlacement='bottom'
                onClick={toggleChatMode}
            />
            <Button
                chromeless
                shape='circle'
                icon='times'
                tooltip={msg('home.chat.close')}
                tooltipPlacement='bottomRight'
                onClick={closeChat}
            />
        </ButtonGroup>
    )

    const renderHeader = () => (
        <Layout className={styles.header} type='horizontal-nowrap'>
            {isConversation ? renderConversationToolbar() : renderConversationListToolbar()}
            <span className={styles.title}>{msg('home.chat.title')}</span>
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
            <ChatMessages messages={messages} thinking={isThinking} isLoading={isLoading}/>
            <ChatInput
                key={activeConversationId}
                onSend={handleSend}
                disabled={!isConnected || !activeConversationId}
                sendDisabled={isLoading}
            />
        </>
    )

    return isOpen ? (
        <div className={[
            isSplit ? styles.split : styles.panel,
            className
        ].join(' ')}>
            {isSplit ? (
                <div
                    className={styles.resizeHandle}
                    onPointerDown={handleResizeStart}
                />
            ) : null}
            {renderHeader()}
            {isConversation ? renderConversation() : renderConversationList()}
        </div>
    ) : null
}

ChatPanel.propTypes = {
    className: PropTypes.string
}
