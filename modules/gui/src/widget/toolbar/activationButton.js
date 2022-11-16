import {Activator} from 'widget/activation/activator'
import {ToolbarButton} from './toolbarButton'
import PropTypes from 'prop-types'
import React from 'react'
import styles from './toolbar.module.css'

export class ActivationButton extends React.Component {
    constructor() {
        super()
        this.renderButton = this.renderButton.bind(this)
    }

    render() {
        const {id} = this.props
        return (
            <Activator id={id}>
                {this.renderButton}
            </Activator>
        )
    }

    renderButton({activate, deactivate, active, canActivate}) {
        const {icon, label, tooltip, disabled, onClick} = this.props
        return (
            <ToolbarButton
                disabled={disabled || (!active && !canActivate)}
                selected={active}
                icon={icon}
                label={label}
                tooltip={active ? null : tooltip}
                className={[styles.activationButton, styles.panelButton, active ? styles.selected : null].join(' ')}
                onClick={e => {
                    active ? deactivate() : activate()
                    onClick && onClick(e)
                }}/>
        )
    }
}

ActivationButton.propTypes = {
    id: PropTypes.string.isRequired,
    disabled: PropTypes.any,
    icon: PropTypes.string,
    label: PropTypes.string,
    tooltip: PropTypes.string,
    onClick: PropTypes.func
}
