import PropTypes from 'prop-types'
import React from 'react'
import styles from './buttonGroup.module.css'

const typeClassNames = type =>
    type.split('-').map(className => styles[className])

export const ButtonGroup = ({children, type, className}) =>
    <div className={[
        styles.container,
        className
    ].join(' ')}>
        <div className={[
            styles.buttonGroup,
            ...typeClassNames(type)
        ].join(' ')}>
            {children}
        </div>
    </div>

ButtonGroup.propTypes = {
    children: PropTypes.any.isRequired,
    className: PropTypes.string,
    type: PropTypes.oneOf([
        'horizontal-wrap', 'horizontal-wrap-fill',
        'horizontal-nowrap', 'horizontal-nowrap-fill',
        'horizontal-tight',
        'vertical', 'vertical-tight'
    ])
}

ButtonGroup.defaultProps = {
    type: 'horizontal-wrap'
}
