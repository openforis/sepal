import {useCallback, useEffect, useRef, useState} from 'react'
import {Subject} from 'rxjs'

import api from '~/apiRegistry'
import {getLogger} from '~/log'

const log = getLogger('chat-ws')

export const useChatWebSocket = () => {
    const [isConnected, setIsConnected] = useState(false)
    const upstreamRef = useRef(null)
    const messageSubjectRef = useRef(null)
    if (messageSubjectRef.current === null) {
        messageSubjectRef.current = new Subject()
    }

    useEffect(() => {
        const {upstream$, downstream$} = api.chat.ws()
        upstreamRef.current = upstream$
        const subject = messageSubjectRef.current

        const subscription = downstream$.subscribe({
            next: msg => {
                if (msg.ready !== undefined) {
                    setIsConnected(msg.ready)
                } else if (msg.data) {
                    subject.next(msg.data)
                }
            },
            error: error => {
                log.error('Chat websocket error', error)
                setIsConnected(false)
            }
        })

        return () => {
            subscription.unsubscribe()
            upstreamRef.current = null
        }
    }, [])

    const send = useCallback(data => {
        if (upstreamRef.current) {
            upstreamRef.current.next(data)
        }
    }, [])

    const respond = useCallback((requestId, payload) => {
        if (upstreamRef.current && requestId) {
            upstreamRef.current.next({type: 'gui-response', requestId, ...payload})
        }
    }, [])

    return {
        isConnected,
        send,
        respond,
        message$: messageSubjectRef.current
    }
}
