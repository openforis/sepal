import PropTypes from 'prop-types'
import React from 'react'
import styles from './padding.module.css'

export const Padding = ({noHorizontal, noVertical, className, children}) => {
    return (
        <div className={[
            styles.padding,
            noHorizontal ? styles.noHorizontal : null,
            noVertical ? styles.noVertical : null,
            className
        ].join(' ')}>
            {children}
        </div>
    )
}

Padding.propTypes = {
    children: PropTypes.any,
    className: PropTypes.string,
    noHorizontal: PropTypes.any,
    noVertical: PropTypes.any
}
