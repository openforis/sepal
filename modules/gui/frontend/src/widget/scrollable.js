import PropTypes from 'prop-types'
import React from 'react'
import flexy from './flexy.module.css'
import styles from './scrollable.module.css'

export const ScrollableContainer = ({className, children}) => {
    return (
        <div className={[flexy.container, className].join(' ')}>
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
        <div className={[flexy.rigid, className].join(' ')}>
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
        <div className={[flexy.elastic, styles.scrollable, styles[direction], className].join(' ')}>
            {children}
        </div>
    )
}

Scrollable.propTypes = {
    children: PropTypes.any.isRequired,
    className: PropTypes.string,
    direction: PropTypes.oneOf(['x', 'y', 'xy'])
}
