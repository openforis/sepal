import {Layout} from 'widget/layout'
import Label from 'widget/label'
import PropTypes from 'prop-types'
import React from 'react'
import styles from './widget.module.css'

export class Widget extends React.Component {
    render() {
        const {layout, spacing, border, disabled, className, onClick} = this.props
        const widgetState = this.getWidgetState()
        return (
            <div
                className={[
                    styles.container,
                    styles[widgetState],
                    onClick && !disabled ? styles.clickable : null,
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
                        disabled ? styles.normal : styles[widgetState],
                        border ? styles.border : null
                    ].join(' ')}>
                    {this.renderContent()}
                </Layout>
            </div>
        )
    }

    renderContent() {
        const {children} = this.props
        return children
    }

    getWidgetState() {
        const {errorMessage, busyMessage} = this.props
        if (errorMessage) return 'error'
        if (busyMessage) return 'busy'
        return 'normal'
    }

    renderLabel() {
        const {label, labelButtons, tooltip, tooltipPlacement, tooltipTrigger, alignment, errorMessage} = this.props
        return label
            ? (
                <Label
                    alignment={alignment}
                    msg={label}
                    buttons={labelButtons}
                    tooltip={tooltip}
                    tooltipPlacement={tooltipPlacement}
                    tooltipTrigger={tooltipTrigger}
                    tabIndex={-1}
                    error={errorMessage}
                />
            )
            : null
    }

    getBusyMessage() {
        const {busyMessage} = this.props
        return busyMessage
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
    labelButtons: PropTypes.any,
    layout: PropTypes.any,
    spacing: PropTypes.any,
    tooltip: PropTypes.any,
    tooltipPlacement: PropTypes.any,
    tooltipTrigger: PropTypes.any,
    onClick: PropTypes.func
}

Widget.defaultProps = {
    layout: 'vertical',
    spacing: 'none'
}
