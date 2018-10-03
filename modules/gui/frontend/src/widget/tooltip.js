import './tooltip.css'
import 'rc-tooltip/assets/bootstrap.css'
import PropTypes from 'prop-types'
import RcTooltip from 'rc-tooltip'
import React from 'react'

export default class Tooltip extends React.Component {
    placement() {
        const {placement, left, right, top, bottom, topLeft, topRight, bottomLeft, bottomRight} = this.props
        return placement ||
        left ? 'left' :
            right ? 'right' :
                top ? 'top' :
                    bottom ? 'bottom' :
                        topLeft ? 'topLeft' :
                            topRight ? 'topRight' :
                                bottomLeft ? 'bottomLeft' :
                                    bottomRight ? 'bottomRight' :
                                        'top'
    }

    render() {
        const {msg, disabled = false, delay = .5, children, ...otherProps} = this.props
        return (
            msg && !disabled
                ? (
                    <RcTooltip
                        overlay={msg}
                        placement={this.placement()}
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
    placement: PropTypes.string,
    right: PropTypes.bool,
    top: PropTypes.bool,
    topLeft: PropTypes.bool,
    topRight: PropTypes.bool
}
