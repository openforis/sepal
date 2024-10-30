import PropTypes from 'prop-types'
import React from 'react'

import {Button} from '~/widget/button'

import {Context} from './context'
import styles from './toolbar.module.css'

export class ToolbarButton extends React.Component {
    constructor() {
        super()
        this.renderContext = this.renderContext.bind(this)
    }

    render() {
        return (
            <Context.Consumer>
                {this.renderContext}
            </Context.Consumer>
        )
    }

    renderContext({horizontal, panel}) {
        const {className, icon, iconVariant, label, tooltip, tooltipAllowedWhenDisabled, tooltipDelay, tooltipOnVisible, tooltipPlacement, disabled, selected, onClick} = this.props
        console.log({className})
        return (
            <Button
                className={[
                    selected && !disabled ? styles.selected : null,
                    panel ? styles.panel : null,
                    className
                ].join(' ')}
                icon={icon}
                iconVariant={iconVariant}
                label={label}
                disabled={disabled}
                onClick={onClick}
                tooltip={tooltip}
                tooltipAllowedWhenDisabled={tooltipAllowedWhenDisabled}
                tooltipOnVisible={tooltipOnVisible}
                tooltipPlacement={tooltipPlacement || horizontal ? 'top' : 'left'}
                tooltipDisabled={panel && selected}
                tooltipDelay={tooltipDelay}
            />
        )
    }
}

ToolbarButton.propTypes = {
    className: PropTypes.string,
    disabled: PropTypes.any,
    icon: PropTypes.string,
    iconVariant: PropTypes.string,
    label: PropTypes.string,
    selected: PropTypes.any,
    tooltip: PropTypes.any,
    tooltipAllowedWhenDisabled: PropTypes.any,
    tooltipDelay: PropTypes.number,
    tooltipOnVisible: PropTypes.func,
    tooltipPlacement: PropTypes.string,
    onClick: PropTypes.func
}
