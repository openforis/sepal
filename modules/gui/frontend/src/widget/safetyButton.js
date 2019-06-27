import {Button} from 'widget/button'
import {msg} from 'translate'
import Confirm from 'widget/confirm'
import PropTypes from 'prop-types'
import React from 'react'

export default class SafetyButton extends React.Component {
    state = {
        askConfirmation: false
    }

    askConfirmation(askConfirmation) {
        this.setState({askConfirmation})
    }

    renderConfirm() {
        const {title, message, label, onConfirm, children} = this.props
        return (
            <Confirm
                title={title}
                message={message}
                label={label || msg('widget.safetyButton.label')}
                onConfirm={() => {
                    this.askConfirmation(false)
                    onConfirm()
                }}
                onCancel={() => this.askConfirmation(false)}>
                {children}
            </Confirm>
        )
    }

    render() {
        const {chromeless, shape, icon, skip, onConfirm, ...otherProps} = this.props
        const {askConfirmation} = this.state
        return (
            <React.Fragment>
                <Button
                    chromeless={chromeless}
                    shape={shape}
                    icon={icon}
                    {...otherProps}
                    onClick={() => skip ? onConfirm() : this.askConfirmation(true)}
                    onClickHold={() => onConfirm()}
                />
                {askConfirmation ? this.renderConfirm() : null}
            </React.Fragment>
        )
    }
}

SafetyButton.propTypes = {
    message: PropTypes.string.isRequired,
    onConfirm: PropTypes.func.isRequired,
}

SafetyButton.defaultProps = {
    chromeless: true,
    shape: 'circle',
    icon: 'trash'
}
