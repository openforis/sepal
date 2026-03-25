import PropTypes from 'prop-types'
import {useCallback, useEffect, useRef, useState} from 'react'
import {map, of, tap} from 'rxjs'

import {actionBuilder} from '~/action-builder'
import api from '~/apiRegistry'
import {
    closeRecipe,
    initializeRecipe,
    isRecipeOpen,
    selectRecipe
} from '~/app/home/body/process/recipe'
import {getLogger} from '~/log'
import {select} from '~/store'
import {msg} from '~/translate'
import {Button} from '~/widget/button'
import {ButtonGroup} from '~/widget/buttonGroup'

import {ChatInput} from './chatInput'
import {ChatMessages} from './chatMessages'
import styles from './chatPanel.module.css'
import {ConversationList} from './conversationList'

const log = getLogger('chat')

export const ChatPanel = ({className, isOpen, mode = 'overlay', onClose, onToggleMode}) => {
    const [messages, setMessages] = useState([])
    const [isLoading, setIsLoading] = useState(false)
    const [isThinking, setIsThinking] = useState(false)
    const [isConnected, setIsConnected] = useState(false)
    const [view, setView] = useState('list')
    const [conversations, setConversations] = useState([])
    const [activeConversationId, setActiveConversationId] = useState(null)
    const wsRef = useRef(null)
    const actionSubRef = useRef(null)
    const streamingRef = useRef(false)
    const activeConversationIdRef = useRef(null)
    const messagesRef = useRef(messages)
    messagesRef.current = messages

    useEffect(() => {
        const {upstream$, downstream$} = api.chat.ws()
        wsRef.current = upstream$

        const subscription = downstream$.subscribe({
            next: msg => {
                if (msg.ready !== undefined) {
                    setIsConnected(msg.ready)
                } else if (msg.data) {
                    const {type, text, complete, action, recipeId, conversations: convList, conversationId: convId, messages: convMessages} = msg.data
                    if (type === 'chat-response' || type === 'status') {
                        // Ignore messages from a different conversation
                        if (convId && convId !== activeConversationIdRef.current) {
                            return
                        }
                    }
                    if (type === 'chat-response') {
                        setIsThinking(false)
                        if (text) {
                            if (!streamingRef.current) {
                                streamingRef.current = true
                                setMessages(prev => [...prev, {role: 'assistant', content: text, streaming: !complete}])
                            } else {
                                setMessages(prev => {
                                    const updated = [...prev]
                                    const last = updated[updated.length - 1]
                                    if (last && last.streaming) {
                                        updated[updated.length - 1] = {...last, content: last.content + text, streaming: !complete}
                                    }
                                    return updated
                                })
                            }
                        } else if (complete) {
                            setMessages(prev => {
                                const updated = [...prev]
                                const last = updated[updated.length - 1]
                                if (last && last.streaming) {
                                    updated[updated.length - 1] = {...last, streaming: false}
                                }
                                return updated
                            })
                        }
                        if (complete) {
                            streamingRef.current = false
                            setIsLoading(false)
                        }
                    } else if (type === 'status') {
                        setIsThinking(true)
                        setIsLoading(true)
                    } else if (type === 'gui-action') {
                        handleGuiAction({action, recipeId})
                    } else if (type === 'conversations') {
                        setConversations(convList || [])
                    } else if (type === 'conversation-created') {
                        activeConversationIdRef.current = convId
                        setActiveConversationId(convId)
                        setMessages([])
                        streamingRef.current = false
                        setIsLoading(false)
                        setIsThinking(false)
                        setView('chat')
                    } else if (type === 'conversation-loaded') {
                        activeConversationIdRef.current = convId
                        setActiveConversationId(convId)
                        setMessages((convMessages || []).filter(m => m.role === 'user' || m.role === 'assistant'))
                        streamingRef.current = false
                        setIsLoading(false)
                        setIsThinking(false)
                        setView('chat')
                    } else if (type === 'conversation-claimed') {
                        if (convId && convId === activeConversationIdRef.current) {
                            activeConversationIdRef.current = null
                            setActiveConversationId(null)
                            setMessages([])
                            streamingRef.current = false
                            setIsLoading(false)
                            setIsThinking(false)
                            setView('list')
                            if (wsRef.current) {
                                wsRef.current.next({type: 'list-conversations'})
                            }
                        }
                    }
                }
            },
            error: error => {
                log.error('Chat websocket error', error)
                setIsConnected(false)
            }
        })

        return () => {
            subscription.unsubscribe()
            wsRef.current = null
            if (actionSubRef.current) {
                actionSubRef.current.unsubscribe()
                actionSubRef.current = null
            }
        }
    }, [])

    const openExistingRecipe = useCallback(recipeId => {
        if (isRecipeOpen(recipeId)) {
            selectRecipe(recipeId)
        } else {
            const loadedRecipes = select('process.loadedRecipes') || {}
            const recipe$ = Object.keys(loadedRecipes).includes(recipeId)
                ? of(loadedRecipes[recipeId])
                : api.recipe.load$(recipeId).pipe(
                    map(recipe => initializeRecipe(recipe)),
                    tap(recipe =>
                        actionBuilder('CACHE_RECIPE', recipe)
                            .set(['process.loadedRecipes', recipe.id], recipe)
                            .dispatch()
                    )
                )
            if (actionSubRef.current) {
                actionSubRef.current.unsubscribe()
            }
            actionSubRef.current = recipe$.subscribe({
                next: recipe => {
                    const {id, placeholder, title, type} = recipe
                    actionBuilder('OPEN_RECIPE')
                        .set(['process.tabs', {id: select('process.selectedTabId')}], {id, placeholder, title, type})
                        .set('process.selectedTabId', id)
                        .dispatch()
                },
                error: error => log.error('Failed to open recipe', error)
            })
        }
    }, [])

    const reloadRecipe = useCallback(recipeId => {
        if (actionSubRef.current) {
            actionSubRef.current.unsubscribe()
        }
        actionSubRef.current = api.recipe.load$(recipeId).pipe(
            map(recipe => initializeRecipe(recipe))
        ).subscribe({
            next: recipe =>
                actionBuilder('RELOAD_RECIPE', recipe)
                    .set(['process.loadedRecipes', recipe.id], recipe)
                    .dispatch(),
            error: error => log.error('Failed to reload recipe', error)
        })
    }, [])

    const handleGuiAction = useCallback(({action, recipeId}) => {
        log.info(`GUI action: ${action} recipe ${recipeId}`)
        switch (action) {
            case 'open':
                openExistingRecipe(recipeId)
                break
            case 'reload':
                reloadRecipe(recipeId)
                break
            case 'close':
                closeRecipe(recipeId)
                break
            default:
                log.warn('Unknown GUI action:', action)
        }
    }, [openExistingRecipe, reloadRecipe])

    const handleSend = useCallback(text => {
        if (wsRef.current && isConnected && activeConversationId) {
            setMessages(prev => [...prev, {role: 'user', content: text}])
            setIsLoading(true)
            wsRef.current.next({type: 'message', text})
        }
    }, [isConnected, activeConversationId])

    const handleNewConversation = useCallback(() => {
        if (wsRef.current && isConnected) {
            wsRef.current.next({type: 'create-conversation'})
        }
    }, [isConnected])

    const handleSelectConversation = useCallback(conversationId => {
        if (wsRef.current && isConnected) {
            wsRef.current.next({type: 'select-conversation', conversationId})
        }
    }, [isConnected])

    const handleDeleteConversation = useCallback(conversationId => {
        if (wsRef.current && isConnected) {
            wsRef.current.next({type: 'delete-conversation', conversationId})
        }
    }, [isConnected])

    const handleToggleView = useCallback(() => {
        setView(prev => {
            const next = prev === 'chat' ? 'list' : 'chat'
            if (next === 'list') {
                // Discard empty ephemeral conversation when switching to list
                if (messagesRef.current.length === 0) {
                    activeConversationIdRef.current = null
                    setActiveConversationId(null)
                }
                if (wsRef.current && isConnected) {
                    wsRef.current.next({type: 'list-conversations'})
                }
            }
            return next
        })
    }, [isConnected])

    const isSplit = mode === 'split'
    const panelClass = [
        isSplit ? styles.split : styles.panel,
        !isOpen && styles.hidden,
        className
    ].filter(Boolean).join(' ')

    return (
        <div className={panelClass}>
            <div className={styles.header}>
                <Button
                    chromeless
                    shape='circle'
                    icon={isSplit ? 'thumbtack-slash' : 'thumbtack'}
                    tooltip={msg(isSplit ? 'home.sections.chat.floating' : 'home.sections.chat.sticky')}
                    tooltipPlacement='bottom'
                    onClick={onToggleMode}
                />
                <span className={styles.title}>{msg('home.sections.chat.title')}</span>
                <ButtonGroup layout='horizontal-nowrap' spacing='tight'>
                    <Button
                        look='add'
                        shape='circle'
                        icon='plus'
                        tooltip={msg('home.sections.chat.newConversation')}
                        tooltipPlacement='bottom'
                        disabled={!isConnected || (activeConversationId && messages.length === 0)}
                        onClick={handleNewConversation}
                    />
                    <Button
                        chromeless
                        shape='circle'
                        icon={view === 'chat' ? 'list' : 'comment'}
                        tooltip={msg(view === 'chat' ? 'home.sections.chat.showConversations' : 'home.sections.chat.showChat')}
                        tooltipPlacement='bottom'
                        onClick={handleToggleView}
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
            </div>
            {view === 'list'
                ? <ConversationList
                    conversations={conversations}
                    activeConversationId={activeConversationId}
                    onSelect={handleSelectConversation}
                    onRemove={handleDeleteConversation}
                />
                : <>
                    <ChatMessages messages={messages} thinking={isThinking}/>
                    <ChatInput key={activeConversationId} onSend={handleSend} disabled={isLoading || !isConnected || !activeConversationId}/>
                </>
            }
            {!isConnected && (
                <div className={styles.disconnected}>{msg('home.sections.chat.connecting')}</div>
            )}
        </div>
    )
}

ChatPanel.propTypes = {
    className: PropTypes.string,
    isOpen: PropTypes.bool.isRequired,
    mode: PropTypes.oneOf(['overlay', 'split']),
    onClose: PropTypes.func.isRequired,
    onToggleMode: PropTypes.func.isRequired
}
