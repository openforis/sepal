import PropTypes from 'prop-types'
import ReactMarkdown from 'react-markdown'

import styles from './markdown.module.css'

export const Markdown = ({source}) =>
    <div className={styles.markdown}>
        <ReactMarkdown>{source}</ReactMarkdown>
    </div>

Markdown.propTypes = {
    source: PropTypes.string
}
