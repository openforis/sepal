import PropTypes from 'prop-types'
import React from 'react'

import {asFunctionalComponent} from '~/classComponent'
import {compose} from '~/compose'

import {Icon} from './icon'
import {Shape} from './shape'
import styles from './tag.module.css'

class _Tag extends React.Component {
    render() {
        const {shape, size, upperCase, tooltip, tooltipPlacement} = this.props
        return (
            <Shape
                shape={shape}
                look='transparent'
                size={size}
                tooltip={tooltip}
                tooltipPlacement={tooltipPlacement}
                disableHover={!tooltip}>
                <div className={[styles.contents, upperCase ? styles.upperCase : null].join(' ')}>
                    {this.renderIcon()}
                    {this.renderContents()}
                </div>
            </Shape>
        )
    }

    renderIcon() {
        const {icon} = this.props
        return icon ? (
            <Icon name={icon}/>
        ) : null
    }

    renderContents() {
        const {label, children} = this.props
        return children ? children : label
    }
}

export const Tag = compose(
    _Tag,
    asFunctionalComponent({
        shape: 'pill',
        size: 'normal',
        upperCase: true
    })
)

Tag.propTypes = {
    children: PropTypes.any,
    shape: PropTypes.any,
    icon: PropTypes.any,
    label: PropTypes.any,
    size: PropTypes.any,
    tooltip: PropTypes.any,
    tooltipPlacement: PropTypes.string,
    upperCase: PropTypes.bool
}
