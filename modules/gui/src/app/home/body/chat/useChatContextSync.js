import {useEffect, useRef} from 'react'
import {useSelector} from 'react-redux'
import {useLocation} from 'react-router-dom'

import {select} from '~/store'

import {currentGuiContext} from './chatGuiContext'

export const useChatContextSync = ({isConnected, send}) => {
    useSelectionSubscriptions()

    const lastContextRef = useRef(null)
    const contextDebounceRef = useRef(null)

    useEffect(() => {
        if (!isConnected) lastContextRef.current = null
    }, [isConnected])

    useEffect(() => {
        if (!isConnected) return
        if (contextDebounceRef.current) clearTimeout(contextDebounceRef.current)
        contextDebounceRef.current = setTimeout(() => {
            const guiContext = currentGuiContext()
            const key = JSON.stringify(guiContext)
            if (key !== lastContextRef.current) {
                lastContextRef.current = key
                send({type: 'context', guiContext})
            }
        }, 200)
        return () => {
            if (contextDebounceRef.current) clearTimeout(contextDebounceRef.current)
        }
    })
}

function useSelectionSubscriptions() {
    useSelector(() => select('process.tabs'))
    useSelector(() => select('process.selectedTabId'))
    useSelector(() => select('process.projectId'))
    useSelector(() => select('process.loadedRecipes'))
    useSelector(() => select('apps.tabs'))
    useSelector(() => select('apps.selectedTabId'))
    useLocation()
}
