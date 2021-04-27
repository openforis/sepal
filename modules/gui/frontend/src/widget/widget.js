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
                        styles[widgetState],
                        border ? styles.border : null
                    ].join(' ')}>
                    {this.renderContent()}
                </Layout>
            </div>
        )
    }

    // no busy message
    renderContent() {
        const {children} = this.props
        return children
    }

    // render busy message in place of original content
    // renderContent() {
    //     const {children} = this.props
    //     return (
    //         <div>
    //             <div className={styles.content}>
    //                 {children}
    //             </div>
    //             {this.renderBusyMessage()}
    //         </div>
    //     )
    // }

    // renderBusyMessage() {
    //     const {busyMessage} = this.props
    //     return busyMessage ? (
    //         <div className={styles.busyMessage}>
    //             {busyMessage}
    //         </div>
    //     ) : null
    // }

    getWidgetState() {
        const {errorMessage, busyMessage} = this.props
        return errorMessage
            ? 'error'
            : busyMessage
                ? 'busy'
                : 'normal'
    }
    renderLabel() {
        const {label, labelButtons, tooltip, tooltipPlacement, alignment, errorMessage} = this.props
        return label
            ? (
                <Label
                    alignment={alignment}
                    msg={label}
                    buttons={labelButtons}
                    tooltip={tooltip}
                    tooltipPlacement={tooltipPlacement}
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
    onClick: PropTypes.func
}

Widget.defaultProps = {
    layout: 'vertical',
    spacing: 'none'
}
