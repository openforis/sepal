import PropTypes from 'prop-types'
import ReactMarkdown from 'react-markdown'

import styles from './markdown.module.css'

export const Markdown = ({source}) =>
    <ReactMarkdown className={styles.markdown}>{source}</ReactMarkdown>

Markdown.propTypes = {
    source: PropTypes.string
}
