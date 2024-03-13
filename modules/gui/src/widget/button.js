import {EMPTY, combineLatest, distinctUntilChanged, fromEvent, switchMap, take, takeUntil, timer} from 'rxjs'
import {Icon} from '~/widget/icon'
import {Keybinding} from './keybinding'
import {Link} from '~/route'
import {Tooltip} from '~/widget/tooltip'
import {compose} from '~/compose'
import {download} from '~/widget/download'
import {withButtonGroup} from './buttonGroup'
import {withForwardedRef} from '~/ref'
import {withSubscriptions} from '~/subscription'
import PropTypes from 'prop-types'
import React from 'react'
import _ from 'lodash'
import lookStyles from '~/style/look.module.css'
import styles from './button.module.css'

const CLICK_HOLD_DURATION_MS = 600
const CLICK_CANCEL_DELAY_MS = 250

const windowMouseUp$ = fromEvent(window, 'mouseup').pipe(distinctUntilChanged())

class _Button extends React.Component {
    constructor(props) {
        super(props)
        const {onClickHold} = props
        this.button = onClickHold && React.createRef()
        this.handleClick = this.handleClick.bind(this)
        this.handleMouseEnter = this.handleMouseEnter.bind(this)
        this.handleMouseLeave = this.handleMouseLeave.bind(this)
        this.handleMouseOver = this.handleMouseOver.bind(this)
        this.handleMouseOut = this.handleMouseOut.bind(this)
        this.handleMouseDown = this.handleMouseDown.bind(this)
        this.preventDefault = this.preventDefault.bind(this)
        this.renderKeybinding = this.renderKeybinding.bind(this)
        this.renderVisible = this.renderVisible.bind(this)
        this.renderWrapper = this.renderWrapper.bind(this)
        this.renderLink = this.renderLink.bind(this)
        this.renderTooltip = this.renderTooltip.bind(this)
        this.renderDisabled = this.renderDisabled.bind(this)
        this.renderButton = this.renderButton.bind(this)
        this.renderContents = this.renderContents.bind(this)
    }

    stopPropagation() {
        const {route, linkUrl, stopPropagation = !(route || linkUrl)} = this.props
        return stopPropagation
    }

    isActive() {
        const {disabled, busy} = this.props
        return !disabled && !busy
    }

    isLinked() {
        const {onMouseDown, onClick, onClickHold, route, linkUrl, downloadUrl, type} = this.props
        return onMouseDown || onClick || onClickHold || route || linkUrl || downloadUrl || ['submit', 'reset'].includes(type)
    }

    isNonInteractive() {
        return !this.isActive()
    }

    isHoverRequired() {
        const {tooltip} = this.props
        return this.isLinked() || tooltip
    }

    isHoverForcedOff() {
        const {hover} = this.props
        return hover === false || !this.isHoverRequired()
    }

    isHoverForcedOn() {
        const {hover} = this.props
        return hover === true
    }

    classNames() {
        const {chromeless, className, additionalClassName, look, size, shape, air, labelStyle, hint, dimmed,
            alignment, width, onClickHold, disableTransitions, buttonGroup: {joinLeft, joinRight} = {}} = this.props
        return className ? className : [
            styles.button,
            styles[`size-${size}`],
            styles[`shape-${shape}`],
            styles[`air-${air}`],
            styles[`alignment-${alignment}`],
            styles[`width-${width}`],
            styles[`labelStyle-${labelStyle}`],
            joinLeft ? styles['join-left'] : null,
            joinRight ? styles['join-right'] : null,
            lookStyles.look,
            lookStyles[look],
            chromeless ? lookStyles.chromeless : null,
            this.isHoverForcedOn() ? lookStyles.hoverForcedOn : null,
            this.isHoverForcedOff() ? lookStyles.hoverForcedOff : null,
            this.isNonInteractive() ? lookStyles.disabled : null,
            this.isHoverRequired() ? null : lookStyles.passive,
            dimmed ? lookStyles.dimmed : null,
            disableTransitions ? lookStyles.noTransitions : null,
            onClickHold ? styles.hold : null,
            hint ? styles.hint : null,
            additionalClassName
        ].join(' ')
    }

    preventDefault(e) {
        e.preventDefault()
    }

    handleMouseEnter(e) {
        const {onMouseEnter} = this.props
        onMouseEnter && onMouseEnter(e)
    }

    handleMouseLeave(e) {
        const {onMouseLeave} = this.props
        onMouseLeave && onMouseLeave(e)
    }

    handleMouseOver(e) {
        const {onMouseOver} = this.props
        onMouseOver && onMouseOver(e)
        if (this.stopPropagation()) {
            e.stopPropagation()
        }
    }

    handleMouseOut(e) {
        const {onMouseOut} = this.props
        onMouseOut && onMouseOut(e)
        if (this.stopPropagation()) {
            e.stopPropagation()
        }
    }

    handleMouseDown(e) {
        const {onMouseDown} = this.props
        onMouseDown && onMouseDown(e)
        if (this.stopPropagation()) {
            e.stopPropagation()
        }
    }

    handleClick(e, forceHandle = false) {
        const {onClick, onClickHold, downloadUrl, downloadFilename} = this.props
        if (onClickHold && !forceHandle) {
            e.stopPropagation()
        } else {
            onClick && onClick(e)
            downloadUrl && download(downloadUrl, downloadFilename)
            if (this.stopPropagation()) {
                e.stopPropagation()
            }
        }
    }

    handleClickHold(e) {
        const {onClickHold} = this.props
        onClickHold && onClickHold(e)
        if (this.stopPropagation()) {
            e.stopPropagation()
        }
    }

    getKeymap(keybinding) {
        return _.isArray(keybinding)
            ? _.reduce(keybinding, (keymap, key) => ({...keymap, [key]: this.handleClick}), {})
            : {[keybinding]: this.handleClick}
    }

    renderKeybinding(contents) {
        const {keybinding, hidden} = this.props
        return keybinding
            ? (
                <Keybinding
                    keymap={this.getKeymap(keybinding)}
                    disabled={hidden || !this.isActive()}>
                    {contents}
                </Keybinding>
            )
            : contents
    }

    renderVisible(contents) {
        const {hidden} = this.props
        return hidden ? null : contents
    }

    // The Tooltip component stops propagation of events, thus the ref has to be on a wrapping element.
    renderWrapper(contents) {
        const {onClickHold} = this.props
        const style = {
            '--click-hold-delay-ms': `${CLICK_CANCEL_DELAY_MS}ms`,
            '--click-hold-duration-ms': `${CLICK_HOLD_DURATION_MS - CLICK_CANCEL_DELAY_MS}ms`
        }
        return onClickHold ? (
            <span ref={this.button} className={styles.wrapper} style={style}>
                {contents}
            </span>
        ) : contents
    }

    renderLink(contents) {
        const {route, linkUrl} = this.props
        if (!route && !linkUrl) {
            return contents
        }
        if (route && linkUrl) {
            throw Error('Cannot specify route and linkUrl at the same time.')
        }
        if (route) {
            return this.renderRouteLink(contents)
        }
        if (linkUrl) {
            return this.renderPlainLink(contents)
        }
    }

    renderPlainLink(contents) {
        const {linkUrl, linkTarget} = this.props
        return this.isActive() && linkUrl
            ? (
                <a href={linkUrl} rel='noopener noreferrer' target={linkTarget} onMouseDown={this.preventDefault}>
                    {contents}
                </a>
            )
            : contents
    }

    renderRouteLink(contents) {
        const {route} = this.props
        return this.isActive() && route
            ? (
                <Link to={route} onMouseDown={this.preventDefault}>
                    {contents}
                </Link>
            )
            : contents
    }

    renderTooltip(contents) {
        const {tooltip, tooltipPlacement, tooltipDisabled, tooltipDelay, tooltipOnVisible, tooltipVisible, tooltipClickTrigger, tooltipAllowedWhenDisabled} = this.props
        const visibility = _.isNil(tooltipVisible) ? {} : {visible: tooltipVisible}
        return (tooltipAllowedWhenDisabled || this.isActive()) && tooltip ? (
            <Tooltip
                msg={tooltip}
                placement={tooltipPlacement}
                delay={tooltipDelay}
                hoverTrigger={true}
                clickTrigger={tooltipClickTrigger || !this.isLinked()}
                overlayStyle={{visibility: tooltipDisabled ? 'hidden' : 'visible'}}
                onVisibleChange={tooltipOnVisible}
                {...visibility}
            >
                {contents}
            </Tooltip>
        ) : contents
    }

    renderDisabled(contents) {
        const {tooltipAllowedWhenDisabled} = this.props
        return tooltipAllowedWhenDisabled && !this.isActive()
            ? (
                <div style={{pointerEvents: 'all'}}>
                    {contents}
                </div>
            ) : contents
    }

    renderButton(contents) {
        const {type, style, tabIndex, innerButton, forwardedRef} = this.props
        const elementType = innerButton ? 'div' : 'button'
        const props = {
            ref: forwardedRef,
            type: innerButton ? null : type,
            className: this.classNames(),
            style: this.isActive() ? style : {...style, pointerEvents: 'none'},
            tabIndex,
            disabled: !this.isActive(),
            onMouseEnter: this.handleMouseEnter,
            onMouseLeave: this.handleMouseLeave,
            onMouseOver: this.handleMouseOver,
            onMouseOut: this.handleMouseOut,
            onMouseDown: this.handleMouseDown,
            onClick: this.handleClick
        }
        return React.createElement(elementType, props, contents)
    }

    renderIcon() {
        const {busy, icon, iconType, iconVariant, iconDimmed, iconClassName, iconAttributes, buttonGroup: {dimmed: buttonGroupDimmed} = {}} = this.props
        return React.isValidElement(icon)
            ? icon
            : (
                <Icon
                    name={busy ? 'spinner' : icon}
                    type={iconType}
                    variant={iconVariant}
                    dimmed={iconDimmed || buttonGroupDimmed}
                    className={iconClassName}
                    attributes={iconAttributes}
                />
            )
    }

    renderLabel() {
        const {label} = this.props
        return (
            <span>{label}</span>
        )
    }

    renderContents() {
        const {icon, iconPlacement, label, tail} = this.props
        const content = this.getContent()
        return content ? content : (
            <div className={styles.contents}>
                {icon && iconPlacement === 'left' ? this.renderIcon() : null}
                {_.isNil(label) ? null : this.renderLabel()}
                {icon && iconPlacement === 'right' ? this.renderIcon() : null}
                {tail}
            </div>
        )
    }

    render() {
        const renderSteps = [
            this.renderKeybinding,
            this.renderVisible,
            this.renderWrapper,
            this.renderLink,
            this.renderTooltip,
            this.renderDisabled,
            this.renderButton,
            this.renderContents
        ]
        
        return renderSteps.reduceRight((content, renderStep) => renderStep(content), null)
    }

    getContent() {
        const {content, children} = this.props
        return content || children
    }

    componentDidMount() {
        const {onClickHold, addSubscription} = this.props

        if (onClickHold && this.button.current) {
            const button = this.button.current
            const mouseDown$ = fromEvent(button, 'mousedown')
            const mouseUp$ = fromEvent(button, 'mouseup')
            const mouseEnter$ = fromEvent(button, 'mouseenter')
            const cancel$ = windowMouseUp$
            const mouseTrigger$ = combineLatest([mouseDown$, mouseEnter$])
            const mouseActivate$ = mouseUp$

            // Click-hold is triggered if button pressed more than CLICK_HOLD_DELAY_MS.
            const clickHold$ =
                mouseTrigger$.pipe(
                    switchMap(() =>
                        timer(CLICK_HOLD_DURATION_MS).pipe(
                            takeUntil(cancel$),
                            switchMap(() =>
                                mouseActivate$.pipe(
                                    takeUntil(cancel$),
                                    take(1)
                                )
                            )
                        )
                    )
                )

            addSubscription(
                clickHold$.subscribe(e => {
                    const {onClickHold} = this.props
                    if (this.isActive() && onClickHold) {
                        this.handleClickHold(e)
                    }
                })
            )

            // Click event needs to be handled here for two reasons:
            // - to allow cancellation of click-hold without triggering click, when pressed longer than CLICK_CANCEL_DELAY_MS
            // - to avoid concurrent handling of both click and click-hold when pressed longer than CLICK_HOLD_DELAY_MS
            // Click is triggered only if button pressed less than CLICK_CANCEL_DELAY_MS.
            const click$ =
                mouseTrigger$.pipe(
                    switchMap(() =>
                        mouseActivate$.pipe(
                            takeUntil(cancel$),
                            takeUntil(onClickHold ? timer(CLICK_CANCEL_DELAY_MS) : EMPTY),
                            take(1)
                        )
                    )
                )

            addSubscription(
                click$.subscribe(e => {
                    const {onClick} = this.props
                    if (this.isActive() && onClick) {
                        this.handleClick(e, true)
                    }
                })
            )
        }
    }
}

export const Button =
    compose(
        React.memo(_Button),
        withSubscriptions(),
        withButtonGroup(),
        withForwardedRef()
    )

Button.propTypes = {
    additionalClassName: PropTypes.string,
    air: PropTypes.oneOf(['normal', 'more', 'less', 'none']),
    alignment: PropTypes.oneOf(['left', 'center', 'right']),
    busy: PropTypes.any,
    children: PropTypes.any,
    chromeless: PropTypes.any,
    className: PropTypes.string,
    content: PropTypes.any,
    dimmed: PropTypes.any,
    disabled: PropTypes.any,
    disableTransitions: PropTypes.any,
    downloadFilename: PropTypes.any,
    downloadUrl: PropTypes.any,
    hidden: PropTypes.any,
    hint: PropTypes.any,
    hover: PropTypes.any, // three-state
    icon: PropTypes.oneOfType([PropTypes.string, PropTypes.element]),
    iconAttributes: PropTypes.any,
    iconClassName: PropTypes.any,
    iconDimmed: PropTypes.any,
    iconPlacement: PropTypes.oneOf(['left', 'right']),
    iconType: PropTypes.string,
    iconVariant: PropTypes.string,
    innerButton: PropTypes.any,
    keybinding: PropTypes.oneOfType([PropTypes.string, PropTypes.arrayOf(PropTypes.string)]),
    label: PropTypes.any,
    labelStyle: PropTypes.oneOf(['default', 'smallcaps', 'smallcaps-highlight']),
    linkTarget: PropTypes.string,
    linkUrl: PropTypes.string,
    look: PropTypes.oneOf(['default', 'highlight', 'selected', 'transparent', 'add', 'apply', 'cancel']),
    route: PropTypes.string,
    shape: PropTypes.oneOf(['rectangle', 'pill', 'circle', 'none']),
    size: PropTypes.oneOf(['x-small', 'small', 'normal', 'large', 'x-large', 'xx-large']),
    stopPropagation: PropTypes.any,
    style: PropTypes.object,
    tabIndex: PropTypes.number,
    tail: PropTypes.any,
    tooltip: PropTypes.any,
    tooltipAllowedWhenDisabled: PropTypes.any,
    tooltipClickTrigger: PropTypes.any,
    tooltipDelay: PropTypes.number,
    tooltipDisabled: PropTypes.any,
    tooltipOnVisible: PropTypes.func,
    tooltipPlacement: PropTypes.any,
    type: PropTypes.oneOf(['button', 'submit', 'reset']),
    width: PropTypes.oneOf(['fit', 'fill', 'max']),
    onClick: PropTypes.func,
    onClickHold: PropTypes.func,
    onMouseDown: PropTypes.func,
    onMouseEnter: PropTypes.func,
    onMouseLeave: PropTypes.func,
    onMouseOut: PropTypes.func,
    onMouseOver: PropTypes.func
}

Button.defaultProps = {
    air: 'normal',
    alignment: 'center',
    elementType: 'button',
    iconPlacement: 'left',
    iconVariant: 'normal',
    labelStyle: 'default',
    linkTarget: '_blank',
    look: 'default',
    shape: 'rectangle',
    size: 'normal',
    type: 'button',
    width: 'fit'
}
