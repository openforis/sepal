import PropTypes from 'prop-types'
import React from 'react'

import {asFunctionalComponent} from '~/classComponent'
import {compose} from '~/compose'
import {msg} from '~/translate'
import {Button} from '~/widget/button'
import {Confirm} from '~/widget/confirm'

const TOOLTIP_DELAY_MS = 500

class _ModalConfirmationButton extends React.Component {
    constructor(props) {
        super(props)
        this.onClick = this.onClick.bind(this)
        this.onClickHold = this.onClickHold.bind(this)
    }

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
        const {busy, chromeless, air, disabled, icon, iconType, label, shape, size, tooltip, tooltipPlacement, width} = this.props
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
                    tooltipDelay={TOOLTIP_DELAY_MS}
                    onClick={this.onClick}
                    onClickHold={this.onClickHold}
                />
                {askConfirmation ? this.renderConfirm() : null}
            </React.Fragment>
        )
    }

    onClick(e) {
        const {skipConfirmation, onConfirm} = this.props
        skipConfirmation ? onConfirm(e) : this.askConfirmation(true)
    }

    onClickHold(e) {
        const {onConfirm} = this.props
        onConfirm(e)
    }

    componentDidUpdate({disabled: prevDisabled}) {
        const {disabled} = this.props
        if (!prevDisabled && disabled) {
            this.askConfirmation(false)
        }
    }
}

export const ModalConfirmationButton = compose(
    _ModalConfirmationButton,
    asFunctionalComponent({
        tooltipPlacement: 'top'
    })
)

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
