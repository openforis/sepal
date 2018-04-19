import React from 'react'
import RcTooltip from 'rc-tooltip'
import PropTypes from 'prop-types'
import 'rc-tooltip/assets/bootstrap.css'
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
        delay = 0.25,
        children,
        ...otherProps
    }) => !disabled 
        ? (
            <RcTooltip
                overlay={msg ? message(msg + '.tooltip') : rawMsg}
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
        )
        : <div>{children}</div>

Tooltip.propTypes = {
    msg: PropTypes.string,
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
