import {ModalConfirmationButton, TooltipConfirmationButton} from './safetyButton'
import PropTypes from 'prop-types'
import React from 'react'

export default class RemoveButton extends React.Component {
    render() {
        const {message} = this.props
        return message
            ? this.renderModalConfirmationButton()
            : this.renderTooltipConfirmationButton()
    }

    renderModalConfirmationButton() {
        const {tooltip, tooltipPlacement, title, message, size, onRemove, disabled, unsafe} = this.props
        return (
            <ModalConfirmationButton
                chromeless
                shape='circle'
                icon='trash'
                size={size}
                tooltip={tooltip}
                tooltipPlacement={tooltipPlacement}
                disabled={disabled}
                skipConfirmation={unsafe}
                onConfirm={onRemove}
                title={title}
                message={message}
            />
        )
    }

    renderTooltipConfirmationButton() {
        const {tooltip, tooltipPlacement, size, onRemove, disabled, unsafe} = this.props
        return (
            <TooltipConfirmationButton
                chromeless
                shape='circle'
                icon='trash'
                size={size}
                tooltip={tooltip}
                tooltipPlacement={tooltipPlacement}
                disabled={disabled}
                skipConfirmation={unsafe}
                onConfirm={onRemove}
            />
        )
    }
}

RemoveButton.propTypes = {
    onRemove: PropTypes.func.isRequired,
    chromeless: PropTypes.any,
    disabled: PropTypes.any,
    message: PropTypes.any,
    size: PropTypes.any,
    title: PropTypes.any,
    tooltip: PropTypes.any,
    tooltipPlacement: PropTypes.any,
    unsafe: PropTypes.any
}

RemoveButton.defaultProps = {
    unsafe: false
}
