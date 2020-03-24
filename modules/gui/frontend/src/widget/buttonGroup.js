import PropTypes from 'prop-types'
import React from 'react'
import styles from './buttonGroup.module.css'

const classNames = layout =>
    layout.split('-').map(className => styles[className])

export const ButtonGroup = ({className, layout, alignment, spacing, children}) =>
    <div className={[
        styles.container,
        className
    ].join(' ')}>
        <div className={[
            styles.buttonGroup,
            ...classNames(layout),
            styles[`alignment-${alignment}`],
            styles[`spacing-${spacing}`]
        ].join(' ')}>
            {children}
        </div>
    </div>

ButtonGroup.propTypes = {
    children: PropTypes.any.isRequired,
    alignment: PropTypes.oneOf(['left', 'center', 'right', 'spaced', 'fill']),
    className: PropTypes.string,
    layout: PropTypes.oneOf(['horizontal-wrap', 'horizontal-nowrap', 'vertical']),
    spacing: PropTypes.oneOf(['normal', 'tight', 'loose'])
}

ButtonGroup.defaultProps = {
    alignment: 'left',
    layout: 'horizontal-wrap',
    spacing: 'normal'
}
