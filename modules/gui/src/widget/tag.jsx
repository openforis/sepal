import PropTypes from 'prop-types'
import React from 'react'

import {asFunctionalComponent} from '~/classComponent'
import {compose} from '~/compose'

import {Button} from './button'
import {Icon} from './icon'
import styles from './tag.module.css'

class _Tag extends React.Component {
    render() {
        const {shape, look, size, upperCase, tooltip, tooltipPlacement, tooltipOnVisible} = this.props
        // A tag is no button of its own: it lets clicks reach its container and can sit inside another button.
        return (
            <Button
                shape={shape}
                look={look}
                size={size}
                tooltip={tooltip}
                tooltipPlacement={tooltipPlacement}
                tooltipOnVisible={tooltipOnVisible}
                hover={false}
                innerButton
                stopPropagation={false}>
                <div className={[styles.contents, upperCase ? styles.upperCase : null].join(' ')}>
                    {this.renderIcon()}
                    {this.renderContents()}
                </div>
            </Button>
        )
    }

    renderIcon() {
        const {icon, iconType} = this.props
        return icon ? (
            <Icon name={icon} type={iconType} className={styles.icon}/>
        ) : null
    }

    renderContents() {
        const {label, children} = this.props
        return children
            ? children
            : label ? <span className={styles.label}>{label}</span> : null
    }
}

export const Tag = compose(
    _Tag,
    asFunctionalComponent({
        shape: 'pill',
        look: 'transparent',
        size: 'normal',
        upperCase: true
    })
)

Tag.propTypes = {
    children: PropTypes.any,
    shape: PropTypes.any,
    icon: PropTypes.any,
    iconType: PropTypes.string,
    label: PropTypes.any,
    look: PropTypes.string,
    size: PropTypes.any,
    tooltip: PropTypes.any,
    tooltipOnVisible: PropTypes.func,
    tooltipPlacement: PropTypes.string,
    upperCase: PropTypes.bool
}
