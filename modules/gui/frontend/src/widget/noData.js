import PropTypes from 'prop-types'
import React from 'react'
import styles from './noData.module.css'

export const NoData = ({message, className, children}) =>
    <div className={[
        styles.noData,
        className
    ].join(' ')}>
        {message || children}
    </div>

NoData.propTypes = {
    message: PropTypes.string.isRequired,
    className: PropTypes.string
}
