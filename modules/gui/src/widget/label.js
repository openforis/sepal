import {ButtonGroup} from './buttonGroup'
import {isMobile} from './userAgent'
import Icon from './icon'
import PropTypes from 'prop-types'
import React from 'react'
import Tooltip from './tooltip'
import styles from './label.module.css'

export default class Label extends React.Component {
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
        return children ? children : msg
    }

    renderLeft() {
        return (
            <div>
                {this.renderContents()}
                {this.renderTooltipIcon()}
            </div>
        )
    }

    renderTooltipIcon() {
        const {tooltip, tooltipPlacement} = this.props
        return tooltip
            ? (
                <Icon
                    className={styles.info}
                    name='question-circle'
                    tooltip={tooltip}
                    tooltipPlacement={tooltipPlacement}
                    tooltipClickTrigger={true}
                />
            )
            : null
    }

    renderRight() {
        const {error, buttons} = this.props
        return error || buttons
            ? (
                <ButtonGroup spacing='tight'>
                    {buttons ? buttons : null}
                    {error ? this.renderError() : null}
                </ButtonGroup>
            )
            : null
    }

    renderError() {
        const {error} = this.props
        return (
            <Icon
                className={styles.error}
                name='exclamation-triangle'
                variant='error'
                tooltip={error}
                tooltipPlacement='left'
                tooltipDelay={0}
                attributes={{
                    fade: true
                }}
            />
        )
    }
}

Label.propTypes = {
    alignment: PropTypes.oneOf(['left', 'center', 'right']),
    buttons: PropTypes.arrayOf(PropTypes.node),
    children: PropTypes.any,
    className: PropTypes.string,
    disabled: PropTypes.any,
    error: PropTypes.any,
    msg: PropTypes.any,
    size: PropTypes.oneOf(['small', 'normal', 'large']),
    tooltip: PropTypes.any,
    tooltipPlacement: PropTypes.any
}

Label.defaultProps = {
    alignment: 'left',
    size: 'normal'
}
