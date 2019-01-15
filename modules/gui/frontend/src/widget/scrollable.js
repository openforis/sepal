import PropTypes from 'prop-types'
import React from 'react'
import styles from './scrollable.module.css'

export const ScrollableContainer = ({className, children}) => {
    return (
        <div className={[className, styles.container].join(' ')}>
            {children}
        </div>
    )
}

ScrollableContainer.propTypes = {
    children: PropTypes.any.isRequired,
    className: PropTypes.string
}

export const Unscrollable = ({className, children}) => {
    return (
        <div className={[className, styles.unscrollable].join(' ')}>
            {children}
        </div>
    )
}

Unscrollable.propTypes = {
    children: PropTypes.any.isRequired,
    className: PropTypes.string
}

export const Scrollable = ({className, direction = 'y', children}) => {
    return (
        <div className={[className, styles.scrollable, styles[direction]].join(' ')}>
            {children}
        </div>
    )
}

Scrollable.propTypes = {
    children: PropTypes.any.isRequired,
    className: PropTypes.string,
    direction: PropTypes.oneOf(['x', 'y', 'xy'])
}
