import * as OriginalMarkdown from 'react-markdown'
import PropTypes from 'prop-types'
import React from 'react'
import styles from './markdown.module.css'

export const Markdown = ({source}) =>
    <OriginalMarkdown className={styles.markdown} source={source}/>

Markdown.propTypes = {
    source: PropTypes.string
}
