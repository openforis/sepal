import './tooltip.css'
import 'rc-tooltip/assets/bootstrap.css'

import _ from 'lodash'
import PropTypes from 'prop-types'
import RcTooltip from 'rc-tooltip'
import React from 'react'

import {asFunctionalComponent} from '~/classComponent'
import {compose} from '~/compose'
import {withEnabled} from '~/enabled'
import {withBlurDetector} from '~/widget/blurDetector'
import {isMobile} from '~/widget/userAgent'

import {DEFAULT_PORTAL_CONTAINER_ID} from './portal'
import styles from './tooltip.module.css'

const CLOSE_DELAY_MS = 250

class _Tooltip extends React.Component {
    constructor(props) {
        super(props)
        this.close = this.close.bind(this)
        this.onPopupAlign = this.onPopupAlign.bind(this)
        this.afterVisibleChange = this.afterVisibleChange.bind(this)
    }

    closeTimeout = null

    // The popup renders into the global portal, outside the panel that owns the trigger. Registering it with the
    // nearest detector is what makes using the tooltip count as staying inside that panel.
    popup = null
    releasePopup = null

    state = {
        visible: true
    }

    render() {
        const {enabled = true, placement, disabled, delay, clickTrigger, hoverTrigger, focusTrigger, destroyTooltipOnHide, onVisibleChange, afterVisibleChange: _afterVisibleChange, onPopupAlign: _onPopupAlign, blurDetector: _blurDetector, children, ...otherProps} = this.props
        const {visible} = this.state
        const trigger = _.compact([
            focusTrigger ? 'focus' : '',
            clickTrigger ? 'click' : '',
            hoverTrigger && !isMobile() ? 'hover' : ''
        ])
        const msg = this.getMsg()
        return msg && !disabled && visible && enabled
            ? (
                <RcTooltip
                    overlay={msg}
                    placement={placement}
                    mouseEnterDelay={clickTrigger ? 0 : delay / 1000}
                    trigger={trigger}
                    destroyTooltipOnHide={destroyTooltipOnHide}
                    onVisibleChange={onVisibleChange}
                    afterVisibleChange={this.afterVisibleChange}
                    onPopupAlign={this.onPopupAlign}
                    getTooltipContainer={() => document.getElementById(DEFAULT_PORTAL_CONTAINER_ID)}
                    zIndex={2}
                    {...otherProps}>
                    {children}
                </RcTooltip>
            )
            : children
    }

    close() {
        this.closeTimeout = setTimeout(() => this.setState({visible: false}), CLOSE_DELAY_MS)
    }

    // Realigning the same popup for the same owner must not register it twice; a different popup or a different
    // owner releases the previous registration first.
    onPopupAlign(popup, align) {
        const {blurDetector, onPopupAlign} = this.props
        if (popup !== this.popup || blurDetector !== this.blurDetector) {
            this.release()
            this.popup = popup
            this.blurDetector = blurDetector
            this.releasePopup = blurDetector ? blurDetector.excludeElement(popup) : null
        }
        onPopupAlign && onPopupAlign(popup, align)
    }

    afterVisibleChange(visible) {
        const {afterVisibleChange} = this.props
        if (!visible) {
            this.release()
        }
        afterVisibleChange && afterVisibleChange(visible)
    }

    release() {
        this.releasePopup && this.releasePopup()
        this.releasePopup = null
        this.popup = null
        this.blurDetector = null
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
        this.release()
        if (this.closeTimeout) {
            clearTimeout(this.closeTimeout)
        }
    }
}

export const Tooltip = compose(
    _Tooltip,
    withBlurDetector(),
    withEnabled(),
    asFunctionalComponent({
        clickTrigger: false,
        hoverTrigger: true,
        focusTrigger: false,
        delay: 750,
        disabled: false,
        placement: 'top',
        destroyTooltipOnHide: true
    })
)

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
    onPopupAlign: PropTypes.func,
    placement: PropTypes.oneOf(['top', 'topRight', 'right', 'bottomRight', 'bottom', 'bottomLeft', 'left', 'topLeft']),
    right: PropTypes.bool,
    top: PropTypes.bool,
    topLeft: PropTypes.bool,
    topRight: PropTypes.bool,
    onVisibleChange: PropTypes.func
}
