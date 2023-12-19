import {CrudItem} from 'widget/crudItem'
import PropTypes from 'prop-types'
import React from 'react'
import styles from './appItem.module.css'

const imageUrl = logoRef => logoRef
    ? `/api/apps/images/${logoRef}`
    : null

const renderLogo = logoRef =>
    logoRef
        ? <img
            className={styles.logo}
            src={imageUrl(logoRef)}
            alt=''
        />
        : null

export const AppItem = ({app: {label, tagline, logoRef}, className, highlight, highlightClassName}) =>
    <CrudItem
        className={className}
        title={label}
        description={tagline || '...'}
        image={renderLogo(logoRef)}
        highlight={highlight}
        highlightClassName={highlightClassName}
    />

AppItem.propTypes = {
    app: PropTypes.object,
    className: PropTypes.string,
    highlight: PropTypes.oneOfType([PropTypes.string, PropTypes.object]),
    highlightClassName: PropTypes.string
}
