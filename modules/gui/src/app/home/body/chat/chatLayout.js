import {useCallback} from 'react'

import {actionBuilder} from '~/action-builder'
import {select} from '~/store'

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
export const isSplitMode = mode => mode === CHAT_MODE_SPLIT

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

export const closeChat = () =>
    actionBuilder('CLOSE_CHAT')
        .set('chat.open', false)
        .dispatch()

export const toggleChatMode = () => {
    const mode = getChatMode() === CHAT_MODE_OVERLAY ? CHAT_MODE_SPLIT : CHAT_MODE_OVERLAY
    localStorage.setItem(CHAT_MODE_STORAGE_KEY, mode)
    actionBuilder('TOGGLE_CHAT_MODE')
        .set('chat.mode', mode)
        .dispatch()
}

export const useChatResize = () =>
    useCallback(event => {
        event.preventDefault()
        const startX = event.clientX
        const startWidth = getChatWidth()
        const onPointerMove = e => {
            setChatWidth(startWidth + (startX - e.clientX))
        }
        const stopResize = () => {
            window.removeEventListener('pointermove', onPointerMove)
            window.removeEventListener('pointerup', onPointerUp)
            document.body.style.userSelect = ''
            document.body.style.cursor = ''
        }
        const onPointerUp = () => {
            stopResize()
            storeChatWidth()
        }
        document.body.style.userSelect = 'none'
        document.body.style.cursor = 'col-resize'
        window.addEventListener('pointermove', onPointerMove)
        window.addEventListener('pointerup', onPointerUp)
    }, [])
