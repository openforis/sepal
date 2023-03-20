import {Button} from 'widget/button'
import {Context} from './context'
import PropTypes from 'prop-types'
import React from 'react'
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
        const {className, icon, label, tooltip, tooltipDelay, tooltipPlacement, disabled, selected, onClick} = this.props
        return (
            <Button
                className={[
                    selected && !disabled ? styles.selected : null,
                    panel ? styles.panel : null,
                    className
                ].join(' ')}
                icon={icon}
                label={label}
                disabled={disabled}
                onClick={onClick}
                tooltip={tooltip}
                tooltipPlacement={tooltipPlacement || horizontal ? 'top' : 'left'}
                tooltipDisabled={!!(disabled || (panel && selected))}
                tooltipDelay={tooltipDelay}
            />
        )
    }
}

ToolbarButton.propTypes = {
    className: PropTypes.string,
    disabled: PropTypes.any,
    icon: PropTypes.string,
    label: PropTypes.string,
    selected: PropTypes.any,
    tooltip: PropTypes.any,
    tooltipDelay: PropTypes.number,
    tooltipPlacement: PropTypes.string,
    onClick: PropTypes.func
}
