import PropTypes from 'prop-types'

import {Icon} from '~/widget/icon'
import {Markdown} from '~/widget/markdown'

import styles from './chatMessage.module.css'
import {formatToolDisplay} from './toolFormat'

const ToolEntry = ({tool}) => {
    const status = tool.status || 'success'
    const {label, detail} = formatToolDisplay({
        name: tool.name,
        input: tool.input,
        data: tool.data,
        error: tool.error,
        status
    })
    return (
        <div className={[styles.tool, styles[`tool-${status}`]].join(' ')}>
            <div className={styles.toolHeader}>
                {status === 'running' && <Icon name='circle-notch'/>}
                {status === 'success' && <Icon name='check'/>}
                {status === 'error' && <Icon name='xmark'/>}
                <span className={styles.toolName}>{label}</span>
            </div>
            {detail && <div className={styles.toolDetail}>{detail}</div>}
        </div>
    )
}

const ToolList = ({tools}) => (
    <div className={styles.toolList}>
        {tools.map((tool, i) => (
            <ToolEntry key={tool.id || i} tool={tool}/>
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
                        {tools && tools.length > 0 && <ToolList tools={tools}/>}
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
    tools: PropTypes.arrayOf(PropTypes.object)
}
