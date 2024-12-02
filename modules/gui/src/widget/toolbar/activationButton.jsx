import PropTypes from 'prop-types'
import React from 'react'

import {compose} from '~/compose'
import {withActivators} from '~/widget/activation/activator'

import styles from './toolbar.module.css'
import {ToolbarButton} from './toolbarButton'

class _ActivationButton extends React.Component {
    render() {
        const {className, icon, iconVariant, label, tooltip, tooltipAllowedWhenDisabled, tooltipOnVisible, disabled, onClick, activator: {activatables: {button: {active, canActivate, toggle}}}} = this.props
        return (
            <ToolbarButton
                disabled={disabled || (!active && !canActivate)}
                selected={active}
                icon={icon}
                iconVariant={iconVariant}
                label={label}
                tooltip={active ? null : tooltip}
                tooltipAllowedWhenDisabled={tooltipAllowedWhenDisabled}
                tooltipOnVisible={tooltipOnVisible}
                className={[className || '', styles.activationButton, styles.panelButton, active ? styles.selected : null].join(' ')}
                onClick={e => {
                    toggle()
                    onClick && onClick(e)
                }}/>
        )
    }
}

export const ActivationButton = compose(
    _ActivationButton,
    withActivators({
        button: ({id}) => id
    })
)

ActivationButton.propTypes = {
    id: PropTypes.string.isRequired,
    className: PropTypes.string,
    disabled: PropTypes.any,
    icon: PropTypes.string,
    iconVariant: PropTypes.any,
    label: PropTypes.string,
    tooltip: PropTypes.any,
    tooltipAllowedWhenDisabled: PropTypes.any,
    tooltipOnVisible: PropTypes.func,
    onClick: PropTypes.func
}
