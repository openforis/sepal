import './tooltip.css'
import 'rc-tooltip/assets/bootstrap.css'

import _ from 'lodash'
import PropTypes from 'prop-types'
import RcTooltip from 'rc-tooltip'
import React from 'react'

import {isMobile} from '~/widget/userAgent'

import styles from './tooltip.module.css'

const CLOSE_DELAY_MS = 250

export class Tooltip extends React.Component {
    constructor(props) {
        super(props)
        this.close = this.close.bind(this)
    }

    closeTimeout = null

    state = {
        visible: true
    }

    render() {
        const {placement, disabled, delay, clickTrigger, hoverTrigger, focusTrigger, destroyTooltipOnHide, onVisibleChange, afterVisibleChange, children, ...otherProps} = this.props
        const {visible} = this.state
        const trigger = _.compact([
            focusTrigger ? 'focus' : '',
            clickTrigger ? 'click' : '',
            hoverTrigger && !isMobile() ? 'hover' : ''
        ])
        const msg = this.getMsg()
        return msg && !disabled && visible
            ? (
                <RcTooltip
                    overlay={msg}
                    placement={placement}
                    mouseEnterDelay={clickTrigger ? 0 : delay / 1000}
                    trigger={trigger}
                    destroyTooltipOnHide={destroyTooltipOnHide}
                    onVisibleChange={onVisibleChange}
                    afterVisibleChange={afterVisibleChange}
                    {...otherProps}>
                    {children}
                </RcTooltip>
            )
            : children
    }

    close() {
        this.closeTimeout = setTimeout(() => this.setState({visible: false}), CLOSE_DELAY_MS)
    }

    getMsg() {
        const {msg} = this.props
        if (_.isArray(msg)) {
            return _.compact(msg).map((msg, line) => (
                <div key={line} className={styles.block}>{msg}</div>
            ))
        }
        if (_.isFunction(msg)) {
            return msg({close: this.close})
        }
        return msg
    }

    componentDidUpdate() {
        const {visible} = this.state
        if (!visible) {
            // visible should be false for one cycle only
            this.setState({visible: true})
        }
    }

    componentWillUnmount() {
        if (this.closeTimeout) {
            clearTimeout(this.closeTimeout)
        }
    }
}

Tooltip.propTypes = {
    afterVisibleChange: PropTypes.func,
    bottom: PropTypes.bool,
    bottomLeft: PropTypes.bool,
    bottomRight: PropTypes.bool,
    children: PropTypes.any,
    clickTrigger: PropTypes.any,
    delay: PropTypes.number,
    destroyTooltipOnHide: PropTypes.any,
    disabled: PropTypes.bool,
    focusTrigger: PropTypes.any,
    hoverTrigger: PropTypes.any,
    left: PropTypes.bool,
    msg: PropTypes.any,
    placement: PropTypes.oneOf(['top', 'topRight', 'right', 'bottomRight', 'bottom', 'bottomLeft', 'left', 'topLeft']),
    right: PropTypes.bool,
    top: PropTypes.bool,
    topLeft: PropTypes.bool,
    topRight: PropTypes.bool,
    onVisibleChange: PropTypes.func

}

Tooltip.defaultProps = {
    clickTrigger: false,
    hoverTrigger: true,
    focusTrigger: false,
    delay: 750,
    disabled: false,
    placement: 'top',
    destroyTooltipOnHide: true
}
