import PropTypes from 'prop-types'
import React from 'react'
import styles from './buttonGroup.module.css'

const classNames = layout =>
    layout.split('-').map(className => styles[className])

export const ButtonGroup = ({children, layout, className}) =>
    <div className={[
        styles.container,
        className
    ].join(' ')}>
        <div className={[
            styles.buttonGroup,
            ...classNames(layout)
        ].join(' ')}>
            {children}
        </div>
    </div>

ButtonGroup.propTypes = {
    children: PropTypes.any.isRequired,
    className: PropTypes.string,
    layout: PropTypes.oneOf([
        'horizontal-wrap',
        'horizontal-wrap-tight',
        'horizontal-wrap-spaced',
        'horizontal-wrap-fill', // it adds more vertical space too
        'horizontal-wrap-right',
        'horizontal-nowrap',
        'horizontal-nowrap-tight',
        'horizontal-nowrap-spaced',
        'horizontal-nowrap-fill',
        'horizontal-nowrap-right',
        'vertical',
        'vertical-tight'
    ])
}

ButtonGroup.defaultProps = {
    layout: 'horizontal-wrap'
}
