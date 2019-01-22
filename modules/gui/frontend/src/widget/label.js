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
        return (
            <label className={styles.label}>
                {contents}
            </label>
        )
    }

    renderLabelWithTooltip(contents) {
        const {tooltip, tooltipPlacement} = this.props
        return (
            <label className={styles.label}>
                {contents}
                <Tooltip msg={tooltip} placement={tooltipPlacement}>
                    <Icon className={styles.info} name='question-circle'/>
                </Tooltip>
            </label>
        )
    }

    render() {
        const {tooltip} = this.props
        return tooltip
            ? this.renderLabelWithTooltip(this.renderContents())
            : this.renderLabel(this.renderContents())
    }
}

Label.propTypes = {
    children: PropTypes.oneOfType([PropTypes.object, PropTypes.array]),
    msg: PropTypes.string,
    tooltip: PropTypes.string,
    tooltipPlacement: PropTypes.string
}
