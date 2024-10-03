import _ from 'lodash'
import PropTypes from 'prop-types'
import React from 'react'

import {compose} from '~/compose'
import {withForwardedRef} from '~/ref'
import {Label} from '~/widget/label'
import {Layout} from '~/widget/layout'

import styles from './widget.module.css'

export class _Widget extends React.Component {
    render() {
        const {forwardedRef, layout, spacing, alignment, framed, border, disabled, className, contentClassName, onMouseOver, onMouseOut, onClick} = this.props
        const widgetState = this.getWidgetState()
        return (
            <div
                ref={forwardedRef}
                className={[
                    styles.container,
                    onClick ? styles.clickable : null,
                    disabled ? styles.disabled : null,
                    ['vertical-scrollable', 'vertical-fill'].includes(layout) ? styles.scrollable : null,
                    className
                ].join(' ')}
                onClick={e => onClick && onClick(e)}>
                {this.renderLabel()}
                <Layout
                    type={layout}
                    alignment={alignment}
                    spacing={spacing}
                    framed={framed}
                    className={[
                        styles.widget,
                        disabled ? styles.disabled : null,
                        border ? styles.border : null,
                        styles[widgetState]
                    ].join(' ')}
                    contentClassName={contentClassName}
                    onMouseOver={onMouseOver}
                    onMouseOut={onMouseOut}
                >
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
        const {label, labelButtons, alignment, tooltip, tooltipPlacement, tooltipSeverity, tooltipTrigger, disabled, warningMessage, errorMessage} = this.props
        return _.isNil(label)
            ? null
            : (
                <Label
                    className={styles.label}
                    msg={label}
                    buttons={labelButtons}
                    alignment={alignment}
                    tooltip={tooltip}
                    tooltipPlacement={tooltipPlacement}
                    tooltipSeverity={tooltipSeverity}
                    tooltipTrigger={tooltipTrigger}
                    tabIndex={-1}
                    warning={!disabled && warningMessage}
                    error={!disabled && errorMessage}
                />
            )
    }

    getBusyMessage() {
        const {busyMessage} = this.props
        return busyMessage
    }
}

export const Widget = compose(
    _Widget,
    withForwardedRef()
)

Widget.propTypes = {
    children: PropTypes.any.isRequired,
    alignment: PropTypes.any,
    border: PropTypes.any,
    busyMessage: PropTypes.any,
    className: PropTypes.string,
    contentClassName: PropTypes.string,
    disabled: PropTypes.any,
    errorMessage: PropTypes.any,
    framed: PropTypes.any,
    label: PropTypes.any,
    labelButtons: PropTypes.any,
    layout: PropTypes.any,
    spacing: PropTypes.any,
    tooltip: PropTypes.any,
    tooltipPlacement: PropTypes.any,
    tooltipSeverity: PropTypes.any,
    tooltipTrigger: PropTypes.any,
    warningMessage: PropTypes.any,
    onClick: PropTypes.func,
    onMouseOut: PropTypes.func,
    onMouseOver: PropTypes.func
}

Widget.defaultProps = {
    layout: 'vertical',
    spacing: 'none' // TODO: why spacing none by default?
}
