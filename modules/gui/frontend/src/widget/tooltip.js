import './tooltip.css'
import 'rc-tooltip/assets/bootstrap.css'
import {isMobile} from 'widget/userAgent'
import PropTypes from 'prop-types'
import RcTooltip from 'rc-tooltip'
import React from 'react'

export default class Tooltip extends React.Component {
    render() {
        const {msg, placement = 'top', disabled = false, delay = .75, children, ...otherProps} = this.props
        if (isMobile())
            return children
        return (
            msg && !disabled
                ? (
                    <RcTooltip
                        overlay={msg}
                        placement={placement}
                        mouseEnterDelay={delay}
                        trigger={['hover']}
                        {...otherProps}>
                        {children}
                    </RcTooltip>
                )
                : <React.Fragment>{children}</React.Fragment>)
    }
}

Tooltip.propTypes = {
    bottom: PropTypes.bool,
    bottomLeft: PropTypes.bool,
    bottomRight: PropTypes.bool,
    children: PropTypes.object,
    delay: PropTypes.number,
    disabled: PropTypes.bool,
    left: PropTypes.bool,
    msg: PropTypes.any,
    placement: PropTypes.oneOf(['top', 'topRight', 'right', 'bottomRight', 'bottom', 'bottomLeft', 'left', 'topLeft']),
    right: PropTypes.bool,
    top: PropTypes.bool,
    topLeft: PropTypes.bool,
    topRight: PropTypes.bool
}
