import {ButtonGroup} from './buttonGroup'
import {Layout} from './layout'
import Icon from './icon'
import PropTypes from 'prop-types'
import React from 'react'
import _ from 'lodash'
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
                {this.renderError()}
            </Layout>
        )
    }

    renderRight() {
        const {error, buttons} = this.props
        return error || buttons
            ? (
                <ButtonGroup>
                    {/* {this.renderError()} */}
                    {buttons ? buttons : null}
                </ButtonGroup>
            )
            : null
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

    renderError() {
        const {error} = this.props
        return error ? (
            <Icon
                className={styles.error}
                name='exclamation-triangle'
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
    tooltipPlacement: PropTypes.any
}

Label.defaultProps = {
    alignment: 'left',
    size: 'normal'
}
