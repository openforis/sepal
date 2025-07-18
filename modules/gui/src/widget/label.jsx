import PropTypes from 'prop-types'
import React from 'react'

import {compose} from '~/compose'
import {asFunctionalComponent} from '~/classComponent'

import {Icon} from './icon'
import styles from './label.module.css'
import {Layout} from './layout'

class _Label extends React.Component {
    render() {
        const {className, size, alignment, disabled} = this.props
        return (
            <div className={[
                styles.label,
                styles[size],
                styles[alignment],
                disabled ? styles.disabled : null,
                className
            ].join(' ')}>
                {this.renderLeft()}
                {this.renderRight()}
            </div>
        )
    }

    renderContents() {
        const {msg, children} = this.props
        const content = children ? children : msg
        return React.isValidElement(content)
            ? content
            : <div>{content}</div>
    }

    renderLeft() {
        return (
            <Layout type='horizontal-nowrap' spacing='compact'>
                {this.renderContents()}
                {this.renderTooltipIcon()}
                {this.renderWarning()}
                {this.renderError()}
            </Layout>
        )
    }

    renderRight() {
        const {buttons} = this.props
        return buttons
            ? (
                <Layout type='horizontal-nowrap' spacing='compact'>
                    {buttons ? buttons : null}
                </Layout>
            )
            : null
    }

    renderTooltipIcon() {
        const {tooltip, tooltipPlacement, tooltipSeverity} = this.props
        const ICON_NAME = {
            info: 'question-circle',
            warning: 'triangle-exclamation'
        }
        const ICON_VARIANT = {
            info: 'normal',
            warning: 'warning'
        }
        return tooltip
            ? (
                <Icon
                    className={styles.info}
                    name={ICON_NAME[tooltipSeverity]}
                    variant={ICON_VARIANT[tooltipSeverity]}
                    attributes={{
                        fade: tooltipSeverity === 'warning'
                    }}
                    tooltip={tooltip}
                    tooltipPlacement={tooltipPlacement}
                    tooltipClickTrigger={true}
                />
            )
            : null
    }

    renderWarning() {
        const {warning} = this.props
        return warning ? (
            <Icon
                name='triangle-exclamation'
                variant='warning'
                tooltip={warning}
                tooltipPlacement='right'
                tooltipDelay={0}
            />
        ) : null
    }

    renderError() {
        const {error} = this.props
        return error ? (
            <Icon
                name='triangle-exclamation'
                variant='error'
                tooltip={error}
                tooltipPlacement='right'
                tooltipDelay={0}
                attributes={{
                    fade: true
                }}
            />
        ) : null
    }
}

export const Label = compose(
    _Label,
    asFunctionalComponent({
        alignment: 'left',
        size: 'normal',
        tooltipSeverity: 'info'
    })
)

Label.propTypes = {
    alignment: PropTypes.oneOf(['left', 'center', 'right']),
    buttons: PropTypes.oneOfType([
        PropTypes.node,
        PropTypes.arrayOf(PropTypes.node)
    ]),
    children: PropTypes.any,
    className: PropTypes.string,
    disabled: PropTypes.any,
    error: PropTypes.any,
    msg: PropTypes.any,
    size: PropTypes.oneOf(['small', 'normal', 'large']),
    tooltip: PropTypes.any,
    tooltipPlacement: PropTypes.any,
    tooltipSeverity: PropTypes.oneOf(['info', 'warning']),
    warning: PropTypes.any
}
