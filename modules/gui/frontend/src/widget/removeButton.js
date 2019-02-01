import {Button} from 'widget/button'
import {msg} from 'translate'
import Confirm from 'widget/confirm'
import PropTypes from 'prop-types'
import React from 'react'

export default class RemoveButton extends React.Component {
    state = {
        confirm: false
    }

    confirm(confirm) {
        this.setState(prevState => ({...prevState, confirm}))
    }

    renderConfirm() {
        const {message, label, onConfirm} = this.props
        return (
            <Confirm
                message={message}
                label={label || msg('widget.removeButton.label')}
                onConfirm={() => {
                    this.confirm(false)
                    onConfirm()
                }}
                onCancel={() => this.confirm(false)}
            />
        )
    }

    render() {
        const {size, tooltip, tooltipPlacement, disabled, onConfirm} = this.props
        const {confirm} = this.state
        return (
            <React.Fragment>
                <Button
                    chromeless
                    size={size}
                    shape='circle'
                    icon='trash'
                    tooltip={tooltip}
                    tooltipPlacement={tooltipPlacement}
                    onClick={() => this.confirm(true)}
                    onClickHold={() => onConfirm()}
                    disabled={disabled}/>
                {confirm ? this.renderConfirm() : null}
            </React.Fragment>
        )
    }
}

RemoveButton.propTypes = {
    message: PropTypes.string.isRequired,
    onConfirm: PropTypes.func.isRequired,
    disabled: PropTypes.any,
    label: PropTypes.string,
    size: PropTypes.string,
    tooltip: PropTypes.string,
    tooltipPlacement: PropTypes.string
}
