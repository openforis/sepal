import PropTypes from 'prop-types'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

import styles from './markdown.module.css'

export const Markdown = ({source}) =>
    <div className={styles.markdown}>
        <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
                a: ({node: _node, ...props}) => (
                    <a {...props} target="_blank" rel="noopener noreferrer"/>
                ),
            }}>
            {source}
        </ReactMarkdown>
    </div>

Markdown.propTypes = {
    source: PropTypes.string
}
