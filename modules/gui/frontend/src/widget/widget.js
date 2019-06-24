import {Layout} from 'widget/layout'
import Label from 'widget/label'
import PropTypes from 'prop-types'
import React from 'react'
import styles from './widget.module.css'

export class Widget extends React.Component {
    render() {
        const {layout, spacing, errorMessage, border, className, onClick, children} = this.props
        return (
            <React.Fragment>
                <div
                    className={[
                        styles.container,
                        onClick ? styles.clickable : null,
                        className
                    ].join(' ')}
                    onClick={e => onClick && onClick(e)}>
                    {this.renderLabel()}
                    <Layout
                        type={layout}
                        spacing={spacing}
                        className={[
                            styles.widget,
                            border ? styles.border : null,
                            errorMessage ? styles.error : null
                        ].join(' ')}>
                        {children}
                    </Layout>
                    {this.renderErrorMessage()}
                </div>
                {this.renderErrorMessageSpacer()}
            </React.Fragment>
        )
    }

    renderLabel() {
        const {label, tooltip, tooltipPlacement, alignment, disabled} = this.props
        return label
            ? (
                <Label
                    alignment={alignment}
                    msg={label}
                    tooltip={tooltip}
                    tooltipPlacement={tooltipPlacement}
                    disabled={disabled}
                    tabIndex={-1}
                />
            )
            : null
    }

    renderErrorMessage() {
        const {errorMessage} = this.props
        return errorMessage
            ? (
                <div className={styles.errorMessageContainer}>
                    <div className={styles.errorMessage}>
                        {errorMessage}
                    </div>
                </div>
            )
            : null
    }

    renderErrorMessageSpacer() {
        const {errorMessage} = this.props
        return errorMessage === undefined || errorMessage === false
            ? null
            : <div/>
    }
}

Widget.propTypes = {
    children: PropTypes.any.isRequired,
    alignment: Label.propTypes.alignment,
    border: PropTypes.any,
    className: PropTypes.string,
    disabled: Label.propTypes.disabled,
    errorMessage: PropTypes.any,
    label: Label.propTypes.msg,
    layout: Layout.propTypes.type,
    spacing: Layout.propTypes.spacing,
    tooltip: Label.propTypes.tooltip,
    tooltipPlacement: Label.propTypes.tooltipPlacement,
    onClick: PropTypes.func
}

Widget.defaultProps = {
    layout: 'vertical',
    spacing: 'none'
}
