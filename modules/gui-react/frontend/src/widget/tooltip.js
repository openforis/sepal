import './tooltip.css'
import 'rc-tooltip/assets/bootstrap.css'
import {msg as message} from 'translate'
import PropTypes from 'prop-types'
import RcTooltip from 'rc-tooltip'
import React from 'react'

export default class Tooltip extends React.Component {
    placement() {
        const {left, right, top, bottom, topLeft, topRight, bottomLeft, bottomRight} = this.props
        return left ? 'left' :
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
        const {msg, rawMsg, disabled = false, delay = .5, children, ...otherProps} = this.props
        return (
            !disabled ? (
                <RcTooltip
                    overlay={msg ? message([msg, 'tooltip']) : rawMsg}
                    placement={this.placement()}
                    mouseEnterDelay={delay}
                    trigger={['hover']}
                    {...otherProps}>
                    {children}
                </RcTooltip>
            ) : <React.Fragment>{children}</React.Fragment>)
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
    rawMsg: PropTypes.string,
    right: PropTypes.bool,
    top: PropTypes.bool,
    topLeft: PropTypes.bool,
    topRight: PropTypes.bool
}
