import PropTypes from 'prop-types'
import {useCallback, useEffect, useRef, useState} from 'react'
import {map, of, tap} from 'rxjs'

import {actionBuilder} from '~/action-builder'
import api from '~/apiRegistry'
import {closeRecipe, initializeRecipe, isRecipeOpen, selectRecipe} from '~/app/home/body/process/recipe'
import {getLogger} from '~/log'
import {select} from '~/store'
import {msg} from '~/translate'
import {Button} from '~/widget/button'
import {ButtonGroup} from '~/widget/buttonGroup'
import {Layout} from '~/widget/layout'
import {Panel} from '~/widget/panel/panel'
import {RemoveButton} from '~/widget/removeButton'

import {ChatInput} from './chatInput'
import {ChatMessages} from './chatMessages'
import styles from './chatPanel.module.css'
import {ConversationList} from './conversationList'

const log = getLogger('chat')

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
        } else if (m.role === 'tool') {
            // tool results are shown via the preceding assistant message's toolCalls
        }
    }
    return result
}

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
                    const {type, text, complete, action, recipeId, tools, conversations: convList, conversationId: convId, messages: convMessages} = msg.data
                    if (type === 'chat-response' || type === 'status' || type === 'tool-use') {
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
                    } else if (type === 'tool-use') {
                        setIsThinking(false)
                        const toolNames = tools || []
                        if (streamingRef.current) {
                            streamingRef.current = false
                            setMessages(prev => {
                                const updated = [...prev]
                                const last = updated[updated.length - 1]
                                if (last && last.role === 'assistant') {
                                    updated[updated.length - 1] = {...last, streaming: false, tools: toolNames}
                                }
                                return updated
                            })
                        } else {
                            setMessages(prev => [...prev, {role: 'assistant', content: '', tools: toolNames}])
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
                        setMessages(processLoadedMessages(convMessages || []))
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

    const handleDeleteActiveConversation = useCallback(() => {
        if (activeConversationId) {
            handleDeleteConversation(activeConversationId)
            activeConversationIdRef.current = null
            setActiveConversationId(null)
            setMessages([])
            streamingRef.current = false
            setIsLoading(false)
            setIsThinking(false)
            setView('list')
            if (wsRef.current && isConnected) {
                wsRef.current.next({type: 'list-conversations'})
            }
        }
    }, [activeConversationId, handleDeleteConversation, isConnected])

    const handleDeleteAllConversations = useCallback(() => {
        if (wsRef.current && isConnected) {
            wsRef.current.next({type: 'delete-all-conversations'})
            activeConversationIdRef.current = null
            setActiveConversationId(null)
            setMessages([])
            streamingRef.current = false
            setIsLoading(false)
            setIsThinking(false)
        }
    }, [isConnected])

    const handleShowList = useCallback(() => {
        setView(() => {
            // Discard empty ephemeral conversation when switching to list
            if (messagesRef.current.length === 0) {
                activeConversationIdRef.current = null
                setActiveConversationId(null)
            }
            if (wsRef.current && isConnected) {
                wsRef.current.next({type: 'list-conversations'})
            }
            return 'list'
        })
    }, [isConnected])

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

    // <Panel placement='inline'>
    //     <Panel.Header>
    //         {renderHeader()}
    //     </Panel.Header>
    //     <Panel.Content>
    //         {isConversation ? renderConversation() : renderConversationList()}
    //     </Panel.Content>
    // </Panel>
    ) : null
}

ChatPanel.propTypes = {
    className: PropTypes.string,
    isOpen: PropTypes.bool.isRequired,
    mode: PropTypes.oneOf(['overlay', 'split']),
    onClose: PropTypes.func.isRequired,
    onToggleMode: PropTypes.func.isRequired
}
