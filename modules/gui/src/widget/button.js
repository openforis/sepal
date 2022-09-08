import {EMPTY, combineLatest, distinctUntilChanged, fromEvent, switchMap, take, takeUntil, timer} from 'rxjs'
import {Link} from 'route'
import {compose} from 'compose'
import {download} from 'widget/download'
import {withButtonGroupContext} from './buttonGroup'
import Icon from 'widget/icon'
import Keybinding from './keybinding'
import PropTypes from 'prop-types'
import React from 'react'
import Tooltip from 'widget/tooltip'
import _ from 'lodash'
import lookStyles from 'style/look.module.css'
import styles from './button.module.css'
import withForwardedRef from 'ref'
import withSubscriptions from 'subscription'

const CLICK_HOLD_DURATION_MS = 600
const CLICK_CANCEL_DELAY_MS = 250

const windowMouseUp$ = fromEvent(window, 'mouseup').pipe(distinctUntilChanged())

class _Button extends React.Component {
    constructor(props) {
        super(props)
        const {onClickHold} = props
        this.button = onClickHold && React.createRef()
        this.handleClick = this.handleClick.bind(this)
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
        const {tooltip, tooltipPanel} = this.props
        return this.isLinked() || tooltip || tooltipPanel
    }

    isHoverDisabled() {
        const {hover} = this.props
        return _.isNil(hover)
            ? !this.isHoverRequired()
            : hover === false
    }

    isHoverForced() {
        const {hover} = this.props
        return _.isNil(hover)
            ? false
            : hover === true
    }

    classNames() {
        const {chromeless, className, additionalClassName, look, size, shape, air, labelStyle, hint,
            alignment, width, onClickHold, disableTransitions, buttonGroupContext: {joinLeft, joinRight} = {}} = this.props
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
            this.isHoverForced() ? lookStyles.hoverForced : null,
            this.isHoverDisabled() ? lookStyles.hoverDisabled : null,
            this.isNonInteractive() ? lookStyles.nonInteractive : null,
            disableTransitions ? lookStyles.noTransitions : null,
            onClickHold ? styles.hold : null,
            hint ? styles.hint : null,
            additionalClassName
        ].join(' ')
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

    handleClick(e) {
        const {onClick, downloadUrl, downloadFilename} = this.props
        onClick && onClick(e)
        downloadUrl && download(downloadUrl, downloadFilename)
        if (this.stopPropagation()) {
            e.stopPropagation()
        }
    }

    handleClickHold(e) {
        const {onClickHold} = this.props
        onClickHold && onClickHold(e)
        if (this.stopPropagation()) {
            e.stopPropagation()
        }
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
                <a href={linkUrl} rel='noopener noreferrer' target={linkTarget} onMouseDown={e => e.preventDefault()}>
                    {contents}
                </a>
            )
            : contents
    }

    renderRouteLink(contents) {
        const {route} = this.props
        return this.isActive() && route
            ? (
                <Link to={route} onMouseDown={e => e.preventDefault()}>
                    {contents}
                </Link>
            )
            : contents
    }

    renderTooltip(contents) {
        const {tooltip, tooltipPanel, tooltipPlacement, tooltipDisabled, tooltipDelay, tooltipOnVisible, tooltipVisible, tooltipClickTrigger} = this.props
        const overlayInnerStyle = tooltipPanel ? {padding: 0} : null
        const message = tooltipPanel || tooltip
        const visibility = _.isNil(tooltipVisible) ? {} : {visible: tooltipVisible}
        return this.isActive() && message ? (
            <Tooltip
                msg={message}
                placement={tooltipPlacement}
                delay={tooltipDelay}
                hoverTrigger={!tooltipPanel}
                clickTrigger={tooltipClickTrigger || !this.isLinked()}
                overlayInnerStyle={overlayInnerStyle}
                overlayStyle={{visibility: tooltipDisabled ? 'hidden' : 'visible'}}
                onVisibleChange={tooltipOnVisible}
                {...visibility}
            >
                {contents}
            </Tooltip>
        ) : contents
    }

    getKeymap(keybinding) {
        return _.isArray(keybinding)
            ? _.reduce(keybinding, (keymap, key) => ({...keymap, [key]: this.handleClick}), {})
            : {[keybinding]: this.handleClick}
    }

    renderKeybinding(contents) {
        const {keybinding} = this.props
        return this.isActive() && keybinding
            ? (
                <Keybinding keymap={this.getKeymap(keybinding)}>
                    {contents}
                </Keybinding>
            )
            : contents
    }

    renderButton(contents) {
        const {type, style, tabIndex, onClickHold, forwardedRef} = this.props
        return (
            <button
                ref={forwardedRef}
                type={type}
                className={this.classNames()}
                style={style}
                tabIndex={tabIndex}
                disabled={!this.isActive()}
                onMouseOver={e => this.handleMouseOver(e)}
                onMouseOut={e => this.handleMouseOut(e)}
                onMouseDown={e => this.handleMouseDown(e)}
                onClick={e => onClickHold ? e.stopPropagation() : this.handleClick(e)}
            >
                {contents}
            </button>
        )
    }

    renderIcon() {
        const {busy, icon, iconType, iconVariant, iconDimmed, iconClassName, iconAttributes} = this.props
        return (
            <Icon
                name={busy ? 'spinner' : icon}
                type={iconType}
                variant={iconVariant}
                dimmed={iconDimmed}
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
                {label ? this.renderLabel() : null}
                {icon && iconPlacement === 'right' ? this.renderIcon() : null}
                {tail}
            </div>
        )
    }

    render() {
        const {hidden} = this.props
        return !hidden ? (
            this.renderWrapper(
                this.renderLink(
                    this.renderTooltip(
                        this.renderKeybinding(
                            this.renderButton(
                                this.renderContents()
                            )
                        )
                    )
                )
            )
        ) : null
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
            const mouseTrigger$ = combineLatest(mouseDown$, mouseEnter$)
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
                        this.handleClick(e)
                    }
                })
            )
        }
    }
}

export const Button = compose(
    _Button,
    withSubscriptions(),
    withButtonGroupContext(),
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
    disabled: PropTypes.any,
    disableTransitions: PropTypes.any,
    downloadFilename: PropTypes.any,
    downloadUrl: PropTypes.any,
    hidden: PropTypes.any,
    hint: PropTypes.any,
    hover: PropTypes.any, // three-state
    icon: PropTypes.string,
    iconAttributes: PropTypes.any,
    iconClassName: PropTypes.any,
    iconDimmed: PropTypes.any,
    iconPlacement: PropTypes.oneOf(['left', 'right']),
    iconType: PropTypes.string,
    iconVariant: PropTypes.string,
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
    tooltipClickTrigger: PropTypes.any,
    tooltipDelay: PropTypes.number,
    tooltipDisabled: PropTypes.any,
    tooltipOnVisible: PropTypes.func,
    tooltipPanel: PropTypes.any,
    tooltipPlacement: PropTypes.any,
    tooltipVisible: PropTypes.any,
    type: PropTypes.oneOf(['button', 'submit', 'reset']),
    width: PropTypes.oneOf(['fit', 'fill', 'max']),
    onClick: PropTypes.func,
    onClickHold: PropTypes.func,
    onMouseDown: PropTypes.func,
    onMouseOut: PropTypes.func,
    onMouseOver: PropTypes.func
}

Button.defaultProps = {
    air: 'normal',
    alignment: 'center',
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
