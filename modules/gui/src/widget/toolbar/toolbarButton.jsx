import PropTypes from 'prop-types'
import React from 'react'

import {Button} from '~/widget/button'

import {Context} from './context'
import styles from './toolbarButton.module.css'

export class ToolbarButton extends React.Component {
    constructor(props) {
        super(props)
        this.renderContext = this.renderContext.bind(this)
    }

    render() {
        return (
            <Context.Consumer>
                {this.renderContext}
            </Context.Consumer>
        )
    }

    renderContext({horizontal, vertical}) {
        const {className, icon, iconVariant, label, tooltip, tooltipAllowedWhenDisabled, tooltipDelay, tooltipOnVisible, tooltipPlacement, panel, disabled, selected, error, onClick} = this.props
        return (
            <Button
                className={[
                    styles.toolbarButton,
                    selected && !disabled ? styles.selected : null,
                    panel ? styles.panel : null,
                    horizontal ? styles.horizontal : null,
                    vertical ? styles.vertical : null,
                    error ? styles.error : null,
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
    error: PropTypes.any,
    icon: PropTypes.string,
    iconVariant: PropTypes.string,
    label: PropTypes.string,
    panel: PropTypes.any,
    selected: PropTypes.any,
    tooltip: PropTypes.any,
    tooltipAllowedWhenDisabled: PropTypes.any,
    tooltipDelay: PropTypes.number,
    tooltipOnVisible: PropTypes.func,
    tooltipPlacement: PropTypes.string,
    onClick: PropTypes.func
}
