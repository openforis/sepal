import './tooltip.css'
import 'rc-tooltip/assets/bootstrap.css'
import {isMobile} from 'widget/userAgent'
import PropTypes from 'prop-types'
import RcTooltip from 'rc-tooltip'
import React from 'react'

export default class Tooltip extends React.Component {
    render() {
        const {msg, placement, disabled, delay, clickTrigger, hoverTrigger, destroyTooltipOnHide, onVisibleChange, afterVisibleChange, children, ...otherProps} = this.props
        const trigger = [
            clickTrigger ? 'click' : '',
            hoverTrigger && !isMobile() ? 'hover' : ''
        ]
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
    delay: 750,
    disabled: false,
    placement: 'top',
    destroyTooltipOnHide: true
}
