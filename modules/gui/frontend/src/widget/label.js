import Icon from './icon'
import PropTypes from 'prop-types'
import React from 'react'
import Tooltip from './tooltip'
import styles from './label.module.css'

export default class Label extends React.Component {
    renderContents() {
        const {msg, children} = this.props
        return children ? children : msg
    }

    renderLabel(contents) {
        const {className} = this.props
        return (
            <label className={[styles.label, className].join(' ')}>
                {contents}
                {this.renderTooltip()}
            </label>
        )
    }

    renderTooltip() {
        const {tooltip, tooltipPlacement} = this.props
        return tooltip
            ? (
                <Tooltip msg={tooltip} placement={tooltipPlacement}>
                    <Icon className={styles.info} name='question-circle'/>
                </Tooltip>
            ) : null
    }

    render() {
        return this.renderLabel(this.renderContents())
    }
}

Label.propTypes = {
    children: PropTypes.oneOfType([PropTypes.object, PropTypes.array]),
    className: PropTypes.string,
    msg: PropTypes.string,
    tooltip: PropTypes.string,
    tooltipPlacement: PropTypes.string
}
