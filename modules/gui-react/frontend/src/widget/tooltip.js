import PropTypes from 'prop-types'
import RcTooltip from 'rc-tooltip'
import 'rc-tooltip/assets/bootstrap.css'
import React from 'react'
import {msg as message} from 'translate'


const Tooltip =
    ({
         msg,
         rawMsg,
         left,
         right,
         top,
         bottom,
         topLeft,
         topRight,
         bottomLeft,
         bottomRight,
         disabled = false,
         delay = 0.5,
         className,
         children,
         ...otherProps
     }) => !disabled ? (
        <span className={className}>
                <RcTooltip
                    overlay={msg ? message([msg, 'tooltip']) : rawMsg}
                    placement={
                        left ? 'left' :
                            right ? 'right' :
                                top ? 'top' :
                                    bottom ? 'bottom' :
                                        topLeft ? 'topLeft' :
                                            topRight ? 'topRight' :
                                                bottomLeft ? 'bottomLeft' :
                                                    bottomRight ? 'bottomRight' :
                                                        'top'}
                    mouseEnterDelay={delay}
                    trigger={['hover']}
                    {...otherProps}>
                    {children}
                </RcTooltip>
            </span>
    ) : <div>{children}</div>

Tooltip.propTypes = {
    msg: PropTypes.any,
    rawMsg: PropTypes.string,
    left: PropTypes.bool,
    right: PropTypes.bool,
    top: PropTypes.bool,
    bottom: PropTypes.bool,
    topLeft: PropTypes.bool,
    topRight: PropTypes.bool,
    bottomLeft: PropTypes.bool,
    bottomRight: PropTypes.bool,
    disabled: PropTypes.bool,
    delay: PropTypes.number,
    children: PropTypes.object
}

export default Tooltip
