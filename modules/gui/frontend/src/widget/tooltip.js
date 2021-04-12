import './tooltip.css'
import 'rc-tooltip/assets/bootstrap.css'
import {isMobile} from 'widget/userAgent'
import PropTypes from 'prop-types'
import RcTooltip from 'rc-tooltip'
import React from 'react'

export default class Tooltip extends React.Component {
    render() {
        const {msg, placement, disabled, delay, clickTrigger, destroyTooltipOnHide, children, ...otherProps} = this.props
        const trigger = [
            clickTrigger ? 'click' : '',
            isMobile() ? '' : 'hover'
        ]
        return msg && !disabled
            ? (
                <RcTooltip
                    overlay={msg}
                    placement={placement}
                    mouseEnterDelay={clickTrigger ? 0 : delay / 1000}
                    trigger={trigger}
                    destroyTooltipOnHide={destroyTooltipOnHide}
                    {...otherProps}>
                    {children}
                </RcTooltip>
            )
            : (
                <React.Fragment>{children}</React.Fragment>
            )
    }
}

Tooltip.propTypes = {
    bottom: PropTypes.bool,
    bottomLeft: PropTypes.bool,
    bottomRight: PropTypes.bool,
    children: PropTypes.any,
    clickTrigger: PropTypes.any,
    delay: PropTypes.number,
    destroyTooltipOnHide: PropTypes.any,
    disabled: PropTypes.bool,
    left: PropTypes.bool,
    msg: PropTypes.any,
    placement: PropTypes.oneOf(['top', 'topRight', 'right', 'bottomRight', 'bottom', 'bottomLeft', 'left', 'topLeft']),
    right: PropTypes.bool,
    top: PropTypes.bool,
    topLeft: PropTypes.bool,
    topRight: PropTypes.bool
}

Tooltip.defaultProps = {
    clickTrigger: false,
    delay: 750,
    disabled: false,
    placement: 'top',
    destroyTooltipOnHide: true
}
