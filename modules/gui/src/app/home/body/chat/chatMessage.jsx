import PropTypes from 'prop-types'
import React from 'react'

import {Markdown} from '~/widget/markdown'

import styles from './chatMessage.module.css'

export const ChatMessage = ({role, content}) => {
    const isUser = role === 'user'
    return (
        <div className={[styles.message, isUser ? styles.user : styles.assistant].join(' ')}>
            <div className={styles.bubble}>
                {isUser
                    ? <div className={styles.text}>{content}</div>
                    : <Markdown source={content}/>
                }
            </div>
        </div>
    )
}

export const ThinkingIndicator = () => (
    <div className={[styles.message, styles.assistant].join(' ')}>
        <div className={styles.bubble}>
            <div className={styles.thinking}>
                <span/>
                <span/>
                <span/>
            </div>
        </div>
    </div>
)

ChatMessage.propTypes = {
    content: PropTypes.string.isRequired,
    role: PropTypes.oneOf(['user', 'assistant']).isRequired
}
