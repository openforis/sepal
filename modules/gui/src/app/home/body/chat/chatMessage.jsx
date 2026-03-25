import PropTypes from 'prop-types'

import {Markdown} from '~/widget/markdown'

import styles from './chatMessage.module.css'

const formatToolName = name =>
    name.replace(/_/g, ' ').replace(/^\w/, c => c.toUpperCase())

const ToolTags = ({tools}) => (
    <div className={styles.toolList}>
        {tools.map((name, i) => (
            <span key={i} className={styles.toolName}>
                {formatToolName(name)}
            </span>
        ))}
    </div>
)

export const ChatMessage = ({role, content, tools}) => {
    const isUser = role === 'user'
    return (
        <div className={[styles.message, isUser ? styles.user : styles.assistant].join(' ')}>
            <div className={styles.bubble}>
                {isUser
                    ? <div className={styles.text}>{content}</div>
                    : <>
                        {content && <Markdown source={content}/>}
                        {tools && tools.length > 0 && <ToolTags tools={tools}/>}
                    </>
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
    content: PropTypes.string,
    role: PropTypes.oneOf(['user', 'assistant']).isRequired,
    tools: PropTypes.arrayOf(PropTypes.string)
}
