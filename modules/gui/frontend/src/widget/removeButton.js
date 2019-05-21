import {Button} from 'widget/button'
import PropTypes from 'prop-types'
import React from 'react'
import SafetyButton from './safetyButton'

export default class RemoveButton extends React.Component {
    renderSafe() {
        const {tooltip, tooltipPlacement, message, onRemove, disabled} = this.props
        return (
            <SafetyButton
                chromeless={true}
                shape='circle'
                icon='trash'
                tooltip={tooltip}
                tooltipPlacement={tooltipPlacement}
                message={message}
                onConfirm={onRemove}
                disabled={disabled}
            />
        )
    }

    renderUnsafe() {
        const {tooltip, tooltipPlacement, onRemove, disabled} = this.props
        return (
            <Button
                chromeless={true}
                shape='circle'
                icon='trash'
                tooltip={tooltip}
                tooltipPlacement={tooltipPlacement}
                onClick={onRemove}
                disabled={disabled}
            />
        )
    }
    render() {
        const {unsafe} = this.props
        return unsafe
            ? this.renderUnsafe()
            : this.renderSafe()
    }
}

RemoveButton.propTypes = {
    onRemove: PropTypes.func.isRequired,
    disabled: PropTypes.any,
    message: PropTypes.string,
    tooltip: PropTypes.string,
    tooltipPlacement: PropTypes.string,
    unsafe: PropTypes.any
}

RemoveButton.defaultProps = {
    unsafe: false
}
