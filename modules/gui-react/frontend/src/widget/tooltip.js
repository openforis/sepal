import React from 'react'
import RcTooltip from 'rc-tooltip'
import PropTypes from 'prop-types'
import 'rc-tooltip/assets/bootstrap.css'
import {msg as message} from 'translate'


const Tooltip =
    ({
         msg,
         left,
         right,
         top,
         bottom,
         topLeft,
         topRight,
         bottomLeft,
         bottomRight,
         delay = 0.5,
         children,
         ...otherProps
     }) =>
        <RcTooltip
            overlay={message(msg + '.tooltip')}
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
export default Tooltip

Tooltip.propTypes = {
    msg: PropTypes.string.isRequired,
    left: PropTypes.bool,
    right: PropTypes.bool,
    top: PropTypes.bool,
    bottom: PropTypes.bool,
    topLeft: PropTypes.bool,
    topRight: PropTypes.bool,
    bottomLeft: PropTypes.bool,
    bottomRight: PropTypes.bool
}