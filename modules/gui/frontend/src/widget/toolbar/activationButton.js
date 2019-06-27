import {Activator} from 'widget/activation/activator'
import {ToolbarButton} from './toolbarButton'
import PropTypes from 'prop-types'
import React from 'react'
import styles from './toolbar.module.css'

export class ActivationButton extends React.Component {
    render() {
        const {id, icon, label, tooltip, disabled, onClick} = this.props
        return (
            <Activator id={id}>
                {({activate, deactivate, active, canActivate}) =>
                    <ToolbarButton
                        disabled={disabled || !canActivate}
                        selected={active}
                        icon={icon}
                        label={label}
                        tooltip={tooltip}
                        className={[styles.panelButton, active ? styles.selected : null].join(' ')}
                        onClick={e => {
                            active ? deactivate() : activate()
                            onClick && onClick(e)
                        }}/>
                }
            </Activator>
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
