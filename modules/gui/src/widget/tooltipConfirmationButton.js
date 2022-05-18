import {Button} from 'widget/button'
import {msg} from 'translate'
import Keybinding from 'widget/keybinding'
import PropTypes from 'prop-types'
import React from 'react'

export class TooltipConfirmationButton extends React.Component {
    state = {
        askConfirmation: false,
        tooltipVisible: false
    }

    constructor() {
        super()
        this.setVisibility = this.setVisibility.bind(this)
        this.onClick = this.onClick.bind(this)
        this.onClickHold = this.onClickHold.bind(this)
    }

    renderTooltipConfirmation() {
        const {onConfirm} = this.props
        return (
            <Keybinding keymap={{'Escape': () => this.setVisibility(false)}}>
                <Button
                    look='cancel'
                    icon='exclamation-triangle'
                    label={msg('button.confirm')}
                    onClick={onConfirm}/>
            </Keybinding>
        )
    }

    renderTooltip() {
        const {tooltip} = this.props
        const {askConfirmation} = this.state
        return askConfirmation
            ? this.renderTooltipConfirmation()
            : tooltip
    }

    setVisibility(visible) {
        if (visible) {
            this.setState({tooltipVisible: true})
        } else {
            this.setState({tooltipVisible: false}, () => this.setState({askConfirmation: false}))
        }
    }

    toggleConfirmation() {
        const {askConfirmation} = this.state
        if (askConfirmation) {
            this.setVisibility(false)
        } else {
            this.setState({askConfirmation: true}, () => this.setVisibility(true))
        }
    }

    onClick() {
        const {skipConfirmation, onConfirm} = this.props
        skipConfirmation ? onConfirm() : this.toggleConfirmation()
    }

    onClickHold() {
        const {onConfirm} = this.props
        onConfirm()
    }

    render() {
        const {busy, chromeless, disabled, icon, iconType, label, shape, size, tooltipPlacement, width} = this.props
        const {tooltipVisible} = this.state
        return (
            <Button
                busy={busy}
                chromeless={chromeless}
                icon={icon}
                iconType={iconType}
                label={label}
                shape={shape}
                size={size}
                width={width}
                disabled={disabled}
                tooltip={this.renderTooltip()}
                tooltipPlacement={tooltipPlacement}
                tooltipVisible={tooltipVisible}
                tooltipOnVisible={this.setVisibility}
                onClick={this.onClick}
                onClickHold={this.onClickHold}
            />
        )
    }

    componentDidUpdate({disabled: wasDisabled}) {
        const {disabled} = this.props
        if (!wasDisabled && disabled) {
            this.setVisibility(false)
        }
    }
}

TooltipConfirmationButton.defaultProps = {
    tooltipPlacement: 'top'
}

TooltipConfirmationButton.propTypes = {
    onConfirm: PropTypes.func.isRequired,
    busy: PropTypes.any,
    chromeless: PropTypes.any,
    disabled: PropTypes.any,
    icon: PropTypes.any,
    iconType: PropTypes.any,
    label: PropTypes.any,
    shape: PropTypes.any,
    size: PropTypes.any,
    skipConfirmation: PropTypes.any,
    tooltip: PropTypes.any,
    tooltipPlacement: PropTypes.any,
    width: PropTypes.any
}
