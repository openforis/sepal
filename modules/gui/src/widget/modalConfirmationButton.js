import {Button} from 'widget/button'
import {msg} from 'translate'
import Confirm from 'widget/confirm'
import PropTypes from 'prop-types'
import React from 'react'

export class ModalConfirmationButton extends React.Component {
    state = {
        askConfirmation: false
    }

    askConfirmation(askConfirmation) {
        this.setState({askConfirmation})
    }

    renderConfirm() {
        const {title, message, confirmLabel, onConfirm, children} = this.props
        return (
            <Confirm
                title={title}
                message={message}
                label={confirmLabel || msg('widget.safetyButton.label')}
                onConfirm={() => {
                    onConfirm()
                    this.askConfirmation(false)
                }}
                onCancel={() => this.askConfirmation(false)}>
                {children}
            </Confirm>
        )
    }

    render() {
        const {busy, chromeless, air, disabled, icon, iconType, label, shape, size, skipConfirmation, tooltip, tooltipPlacement, width, onConfirm} = this.props
        const {askConfirmation} = this.state
        return (
            <React.Fragment>
                <Button
                    busy={busy}
                    chromeless={chromeless}
                    icon={icon}
                    iconType={iconType}
                    label={label}
                    shape={shape}
                    size={size}
                    width={width}
                    air={air}
                    disabled={disabled}
                    tooltip={tooltip}
                    tooltipPlacement={tooltipPlacement}
                    tooltipDelay={500}
                    onClick={() => skipConfirmation ? onConfirm() : this.askConfirmation(true)}
                    onClickHold={onConfirm}
                />
                {askConfirmation ? this.renderConfirm() : null}
            </React.Fragment>
        )
    }

    componentDidUpdate({disabled: prevDisabled}) {
        const {disabled} = this.props
        if (!prevDisabled && disabled) {
            this.askConfirmation(false)
        }
    }
}

ModalConfirmationButton.defaultProps = {
    tooltipPlacement: 'top'
}

ModalConfirmationButton.propTypes = {
    message: PropTypes.string.isRequired,
    onConfirm: PropTypes.func.isRequired,
    air: PropTypes.any,
    busy: PropTypes.any,
    children: PropTypes.any,
    chromeless: PropTypes.any,
    confirmLabel: PropTypes.string,
    disabled: PropTypes.any,
    icon: PropTypes.any,
    iconType: PropTypes.any,
    label: PropTypes.any,
    shape: PropTypes.any,
    size: PropTypes.any,
    skipConfirmation: PropTypes.any,
    title: PropTypes.any,
    tooltip: PropTypes.any,
    tooltipPlacement: PropTypes.any,
    width: PropTypes.any
}
