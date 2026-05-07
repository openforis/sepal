import PropTypes from 'prop-types'
import {useEffect, useRef} from 'react'

import {msg} from '~/translate'

import {ChatMessage, ThinkingIndicator} from './chatMessage'
import styles from './chatMessages.module.css'

export const ChatMessages = ({messages, thinking}) => {
    const endRef = useRef(null)

    useEffect(() => {
        endRef.current?.scrollIntoView({behavior: 'smooth'})
    }, [messages, thinking])

    return (
        <div className={styles.messages}>
            {messages.length === 0 && !thinking
                ? <div className={styles.empty}>{msg('home.chat.empty')}</div>
                : messages.map((m, i) => (
                    <ChatMessage key={i} role={m.role} content={m.content} tools={m.tools}/>
                ))
            }
            {thinking && <ThinkingIndicator/>}
            <div ref={endRef}/>
        </div>
    )
}

ChatMessages.propTypes = {
    messages: PropTypes.arrayOf(
        PropTypes.shape({
            role: PropTypes.string.isRequired
        })
    ).isRequired,
    thinking: PropTypes.bool
}
