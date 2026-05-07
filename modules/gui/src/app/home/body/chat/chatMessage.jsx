import PropTypes from 'prop-types'

import {Icon} from '~/widget/icon'
import {Markdown} from '~/widget/markdown'

import styles from './chatMessage.module.css'
import {formatToolDisplay} from './toolFormat'

const ToolEntry = ({tool, status}) => {
    const {label, detail} = formatToolDisplay({
        name: tool.name,
        input: tool.input,
        data: tool.data,
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

const visibleTools = (tools, hiddenToolIds) =>
    (tools || []).filter(tool => !(tool.id && hiddenToolIds?.has(tool.id)))

const effectiveStatus = (tool, statusOverride) =>
    (tool.id && statusOverride?.get(tool.id)) || tool.status || 'success'

const ToolList = ({tools, statusOverride}) => (
    <div className={styles.toolList}>
        {tools.map((tool, i) => (
            <ToolEntry key={tool.id || i} tool={tool} status={effectiveStatus(tool, statusOverride)}/>
        ))}
    </div>
)

export const ChatMessage = ({role, content, tools, hiddenToolIds, statusOverride}) => {
    const isUser = role === 'user'
    const renderedTools = visibleTools(tools, hiddenToolIds)
    const hasContent = !!content && !!content.trim()
    if (!isUser && !hasContent && renderedTools.length === 0) {
        return null
    }
    return (
        <div className={[styles.message, isUser ? styles.user : styles.assistant].join(' ')}>
            <div className={styles.bubble}>
                {isUser
                    ? <div className={styles.text}>{content}</div>
                    : <>
                        {hasContent && <Markdown source={content}/>}
                        {renderedTools.length > 0 && <ToolList tools={renderedTools} statusOverride={statusOverride}/>}
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
    hiddenToolIds: PropTypes.instanceOf(Set),
    role: PropTypes.oneOf(['user', 'assistant']).isRequired,
    statusOverride: PropTypes.instanceOf(Map),
    tools: PropTypes.arrayOf(PropTypes.object)
}
