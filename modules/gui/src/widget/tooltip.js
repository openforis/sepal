import './tooltip.css'
import 'rc-tooltip/assets/bootstrap.css'
import {isMobile} from 'widget/userAgent'
import PropTypes from 'prop-types'
import RcTooltip from 'rc-tooltip'
import React from 'react'
import _ from 'lodash'
import styles from './tooltip.module.css'

export default class Tooltip extends React.Component {
    render() {
        const {placement, disabled, delay, clickTrigger, hoverTrigger, focusTrigger, destroyTooltipOnHide, onVisibleChange, afterVisibleChange, children, ...otherProps} = this.props
        const trigger = _.compact([
            focusTrigger ? 'focus' : '',
            clickTrigger ? 'click' : '',
            hoverTrigger && !isMobile() ? 'hover' : ''
        ])
        const msg = this.getMsg()
        return msg && !disabled
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

    getMsg() {
        const {msg} = this.props
        if (_.isArray(msg)) {
            return msg.map((msg, line) => (
                <div key={line} className={styles.block}>{msg}</div>
            ))
        }
        return msg
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
