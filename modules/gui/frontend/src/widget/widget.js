import {Layout} from 'widget/layout'
import Label from 'widget/label'
import PropTypes from 'prop-types'
import React from 'react'
import {msg} from 'translate'
import styles from './widget.module.css'

export class Widget extends React.Component {
    render() {
        const {layout, spacing, border, disabled, className, onClick, children} = this.props
        // const error = messageType === 'error' && !(message === undefined || message === false)
        const widgetState = this.getWidgetState()
        return (
            <div
                className={[
                    styles.container,
                    styles[widgetState],
                    onClick ? styles.clickable : null,
                    disabled ? styles.disabled : null,
                    className
                ].join(' ')}
                onClick={e => onClick && onClick(e)}>
                {this.renderLabel()}
                <Layout
                    type={layout}
                    spacing={spacing}
                    className={[
                        styles.widget,
                        styles[widgetState],
                        border ? styles.border : null
                    ].join(' ')}>
                    {children}
                </Layout>
                {this.renderMessage()}
            </div>
        )
    }

    getWidgetState() {
        const {errorMessage, busyMessage} = this.props
        return errorMessage 
            ? 'error'
            : busyMessage 
                ? 'busy'
                : 'normal'
    }
    renderLabel() {
        const {label, tooltip, tooltipPlacement, alignment} = this.props
        return label
            ? (
                <Label
                    alignment={alignment}
                    msg={label}
                    tooltip={tooltip}
                    tooltipPlacement={tooltipPlacement}
                    tabIndex={-1}
                />
            )
            : null
    }

    renderMessage() {
        const {errorMessage, busyMessage} = this.props
        const messageStyle = errorMessage 
            ? styles.error 
            : busyMessage 
                ? styles.busy 
                : null
        const message = this.getMessage()
        return message
            ? (
                <div className={styles.messageContainer}>
                    <div className={[styles.message, messageStyle].join(' ')}>
                        {message}
                    </div>
                </div>
            )
            : null
    }

    getMessage() {
        return this.getErrorMessage() || this.getBusyMessage()
    }

    getErrorMessage() {
        const {errorMessage} = this.props
        if (errorMessage) {
            return errorMessage === true
                ? msg('widget.error')
                : errorMessage
        }
    }

    getBusyMessage() {
        const {busyMessage} = this.props
        if (busyMessage) {
            return busyMessage === true
                ? msg('widget.busy')
                : busyMessage
        }
    }
}

Widget.propTypes = {
    children: PropTypes.any.isRequired,
    alignment: PropTypes.any,
    border: PropTypes.any,
    busyMessage: PropTypes.any,
    className: PropTypes.string,
    disabled: PropTypes.any,
    errorMessage: PropTypes.any,
    label: PropTypes.any,
    layout: PropTypes.any,
    spacing: PropTypes.any,
    tooltip: PropTypes.any,
    tooltipPlacement: PropTypes.any,
    onClick: PropTypes.func
}

Widget.defaultProps = {
    layout: 'vertical',
    spacing: 'none'
}
