import PropTypes from 'prop-types'
import React, {useCallback, useEffect, useRef, useState} from 'react'
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
import {Button} from '~/widget/button'
import {ButtonGroup} from '~/widget/buttonGroup'

import {ChatInput} from './chatInput'
import {ChatMessages} from './chatMessages'
import styles from './chatPanel.module.css'

const log = getLogger('chat')

export const ChatPanel = ({isOpen, onClose}) => {
    const [messages, setMessages] = useState([])
    const [isLoading, setIsLoading] = useState(false)
    const [isThinking, setIsThinking] = useState(false)
    const [isConnected, setIsConnected] = useState(false)
    const wsRef = useRef(null)
    const actionSubRef = useRef(null)
    const streamingRef = useRef(false)

    useEffect(() => {
        if (!isOpen) {
            return
        }

        const {upstream$, downstream$} = api.chat.ws()
        wsRef.current = upstream$

        const subscription = downstream$.subscribe({
            next: msg => {
                if (msg.ready !== undefined) {
                    setIsConnected(msg.ready)
                } else if (msg.data) {
                    const {type, text, status, action, recipeId} = msg.data
                    if (type === 'chunk') {
                        setIsThinking(false)
                        if (!streamingRef.current) {
                            streamingRef.current = true
                            setMessages(prev => [...prev, {role: 'assistant', content: text, streaming: true}])
                        } else {
                            setMessages(prev => {
                                const updated = [...prev]
                                const last = updated[updated.length - 1]
                                if (last && last.streaming) {
                                    updated[updated.length - 1] = {...last, content: last.content + text}
                                }
                                return updated
                            })
                        }
                    } else if (type === 'chunk_end') {
                        streamingRef.current = false
                        setMessages(prev => {
                            const updated = [...prev]
                            const last = updated[updated.length - 1]
                            if (last && last.streaming) {
                                updated[updated.length - 1] = {...last, streaming: false}
                            }
                            return updated
                        })
                    } else if (type === 'response') {
                        streamingRef.current = false
                        setIsThinking(false)
                        if (text) {
                            setMessages(prev => [...prev, {role: 'assistant', content: text}])
                        } else {
                            setMessages(prev => {
                                const updated = [...prev]
                                const last = updated[updated.length - 1]
                                if (last && last.streaming) {
                                    updated[updated.length - 1] = {...last, streaming: false}
                                }
                                return updated
                            })
                        }
                        if (status === 'complete') {
                            setIsLoading(false)
                        }
                    } else if (type === 'status') {
                        setIsThinking(true)
                        setIsLoading(true)
                    } else if (type === 'gui-action') {
                        handleGuiAction({action, recipeId})
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
    }, [isOpen])

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
        if (wsRef.current && isConnected) {
            setMessages(prev => [...prev, {role: 'user', content: text}])
            setIsLoading(true)
            wsRef.current.next({type: 'message', text})
        }
    }, [isConnected])

    const handleClear = useCallback(() => {
        streamingRef.current = false
        setMessages([])
        if (wsRef.current) {
            wsRef.current.next({type: 'clear'})
        }
    }, [])

    if (!isOpen) {
        return null
    }

    return (
        <div className={styles.panel}>
            <div className={styles.header}>
                <span className={styles.title}>Chat</span>
                <ButtonGroup layout='horizontal-nowrap' spacing='tight'>
                    <Button
                        chromeless
                        shape='circle'
                        size='small'
                        icon='trash'
                        tooltip='Clear conversation'
                        tooltipPlacement='bottom'
                        disabled={messages.length === 0}
                        onClick={handleClear}
                    />
                    <Button
                        chromeless
                        shape='circle'
                        size='small'
                        icon='times'
                        tooltip='Close'
                        tooltipPlacement='bottom'
                        onClick={onClose}
                    />
                </ButtonGroup>
            </div>
            <ChatMessages messages={messages} thinking={isThinking}/>
            <ChatInput onSend={handleSend} disabled={isLoading || !isConnected}/>
            {!isConnected && (
                <div className={styles.disconnected}>Connecting...</div>
            )}
        </div>
    )
}

ChatPanel.propTypes = {
    isOpen: PropTypes.bool.isRequired,
    onClose: PropTypes.func.isRequired
}
