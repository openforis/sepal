import PropTypes from 'prop-types'
import React from 'react'

import {compose} from '~/compose'
import {withActivators} from '~/widget/activation/activator'

import {ToolbarButton} from './toolbarButton'
import styles from './toolbarButton.module.css'

class _ToolbarActivationButton extends React.Component {
    render() {
        const {className, icon, iconVariant, label, tooltip, tooltipAllowedWhenDisabled, tooltipOnVisible, panel, disabled, error, onClick, activator: {activatables: {button: {active, canActivate, toggle}}}} = this.props
        return (
            <ToolbarButton
                className={[className || '', styles.activationButton, active ? styles.selected : null].join(' ')}
                icon={icon}
                iconVariant={iconVariant}
                label={label}
                tooltip={active ? null : tooltip}
                tooltipAllowedWhenDisabled={tooltipAllowedWhenDisabled}
                tooltipOnVisible={tooltipOnVisible}
                panel={panel}
                disabled={disabled || (!active && !canActivate)}
                selected={active}
                error={error}
                onClick={e => {
                    toggle()
                    onClick && onClick(e)
                }}
            />
        )
    }
}

export const ToolbarActivationButton = compose(
    _ToolbarActivationButton,
    withActivators({
        button: ({id}) => id
    })
)

ToolbarActivationButton.propTypes = {
    id: PropTypes.string.isRequired,
    className: PropTypes.string,
    disabled: PropTypes.any,
    error: PropTypes.any,
    icon: PropTypes.string,
    iconVariant: PropTypes.any,
    label: PropTypes.string,
    panel: PropTypes.any,
    tooltip: PropTypes.any,
    tooltipAllowedWhenDisabled: PropTypes.any,
    tooltipOnVisible: PropTypes.func,
    onClick: PropTypes.func
}
