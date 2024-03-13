import {InlineConfirmationButton} from './inlineConfirmationButton'
import {ModalConfirmationButton} from './modalConfirmationButton'
import {msg} from '~/translate'
import PropTypes from 'prop-types'
import React from 'react'

export class RemoveButton extends React.Component {
    render() {
        const {message} = this.props
        return message
            ? this.renderModalConfirmationButton()
            : this.renderInlineConfirmationButton()
    }

    renderModalConfirmationButton() {
        const {chromeless, air, icon, label, tooltip, tooltipPlacement, title, message, shape, size, onRemove, disabled, unsafe, children} = this.props
        return (
            <ModalConfirmationButton
                chromeless={chromeless}
                air={air}
                shape={shape}
                size={size}
                icon={icon}
                label={label}
                tooltip={tooltip}
                tooltipPlacement={tooltipPlacement}
                disabled={disabled}
                skipConfirmation={unsafe}
                title={title}
                message={message}
                onConfirm={onRemove}
            >
                {children}
            </ModalConfirmationButton>
        )
    }

    renderInlineConfirmationButton() {
        const {chromeless, air, icon, label, confirmationLabel, tooltip, tooltipPlacement, shape, size, onRemove, disabled, unsafe} = this.props
        return (
            <InlineConfirmationButton
                chromeless={chromeless}
                air={air}
                shape={shape}
                size={size}
                icon={icon}
                label={label}
                confirmationLabel={confirmationLabel || msg('button.remove')}
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
    air: PropTypes.any,
    children: PropTypes.any,
    chromeless: PropTypes.any,
    confirmationLabel: PropTypes.any,
    disabled: PropTypes.any,
    label: PropTypes.any,
    message: PropTypes.any,
    shape: PropTypes.any,
    size: PropTypes.any,
    title: PropTypes.any,
    tooltip: PropTypes.any,
    tooltipPlacement: PropTypes.any,
    unsafe: PropTypes.any
}

RemoveButton.defaultProps = {
    unsafe: false,
    icon: 'trash'
}
