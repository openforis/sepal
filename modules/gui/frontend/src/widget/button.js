import {EMPTY, combineLatest, fromEvent, merge, timer} from 'rxjs'
import {Link} from 'route'
import {distinctUntilChanged, switchMap, take, takeUntil} from 'rxjs/operators'
import {download} from 'widget/download'
import Icon from 'widget/icon'
import PropTypes from 'prop-types'
import React from 'react'
import Tooltip from 'widget/tooltip'
import lookStyles from 'style/look.module.css'
import styles from './button.module.css'
import withForwardedRef from 'ref'

const CLICK_HOLD_DELAY_MS = 750
const CLICK_CANCEL_DELAY_MS = 250

const windowMouseUp$ = fromEvent(window, 'mouseup').pipe(distinctUntilChanged())

class _Button extends React.Component {
    subscriptions = []

    constructor(props) {
        super(props)
        const {onClickHold} = props
        this.button = onClickHold && React.createRef()
    }

    stopPropagation() {
        const {link, stopPropagation = !link} = this.props
        return stopPropagation
    }

    active() {
        const {shown = true, disabled = false} = this.props
        return shown && !disabled
    }

    linked() {
        const {onMouseDown, onClick, onClickHold, link, downloadUrl, type} = this.props
        return onMouseDown || onClick || onClickHold || link || downloadUrl || ['submit', 'reset'].includes(type)
    }

    nonInteractive() {
        return !this.active() || !this.linked()
    }

    classNames() {
        const {chromeless, className, additionalClassName, look, size, shape,
            alignment, width, onClickHold, hover, disableTransitions} = this.props
        return className ? className : [
            styles.button,
            styles[size],
            styles[shape],
            styles[alignment],
            styles[width],
            lookStyles.look,
            lookStyles[look],
            chromeless ? lookStyles.chromeless : null,
            hover === true ? lookStyles.hover : null,
            hover === false ? lookStyles.noHover : null,
            disableTransitions ? lookStyles.noTransitions : null,
            this.nonInteractive() ? lookStyles.nonInteractive : null,
            onClickHold ? styles.hold : null,
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
            '--click-hold-duration-ms': `${CLICK_HOLD_DELAY_MS - CLICK_CANCEL_DELAY_MS}ms`
        }
        return onClickHold ? (
            <span ref={this.button} className={styles.wrapper} style={style}>
                {contents}
            </span>
        ) : contents
    }

    renderLink(contents) {
        const {link, shown, disabled} = this.props
        return link && shown && !disabled ? (
            <Link to={link} onMouseDown={e => e.preventDefault()}>
                {contents}
            </Link>
        ) : contents
    }

    renderTooltip(contents) {
        const {tooltip, tooltipPlacement, tooltipDisabled, disabled} = this.props
        return tooltip && !tooltipDisabled && !disabled ? (
            <Tooltip msg={tooltip} placement={tooltipPlacement}>
                {contents}
            </Tooltip>
        ) : contents
    }

    renderButton(contents) {
        const {type, tabIndex, disabled, onClickHold, forwardedRef} = this.props
        return (
            <button
                ref={forwardedRef}
                type={type}
                className={this.classNames()}
                tabIndex={tabIndex}
                disabled={disabled}
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
        const {icon, iconType, iconFlipHorizontal} = this.props
        return (
            <Icon
                name={icon}
                type={iconType}
                flip={iconFlipHorizontal ? 'horizontal' : null}
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
        const {icon, iconPlacement, label, children} = this.props
        return children ? children : (
            <div className={styles.contents}>
                {icon && iconPlacement === 'left' ? this.renderIcon() : null}
                {label ? this.renderLabel() : null}
                {icon && iconPlacement === 'right' ? this.renderIcon() : null}
            </div>
        )
    }

    render() {
        const {shown = true} = this.props
        return shown ? (
            this.renderWrapper(
                this.renderLink(
                    this.renderTooltip(
                        this.renderButton(
                            this.renderContents()
                        )
                    )
                )
            )
        ) : null
    }

    componentDidMount() {
        const {onClickHold} = this.props

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
                        timer(CLICK_HOLD_DELAY_MS).pipe(
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

            this.subscriptions.push(
                clickHold$.subscribe(e => {
                    const {onClickHold, disabled} = this.props
                    if (onClickHold && !disabled) {
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
                            takeUntil(
                                merge(
                                    cancel$,
                                    onClickHold ? timer(CLICK_CANCEL_DELAY_MS) : EMPTY
                                )
                            ),
                            take(1)
                        )
                    )
                )

            this.subscriptions.push(
                click$.subscribe(e => {
                    const {onClick, disabled} = this.props
                    if (onClick && !disabled) {
                        this.handleClick(e)
                    }
                })
            )
        }
    }

    componentWillUnmount() {
        this.subscriptions.forEach(subscription => subscription.unsubscribe())
    }
}

export const Button = (
    withForwardedRef(
        _Button
    )
)

Button.propTypes = {
    additionalClassName: PropTypes.string,
    alignment: PropTypes.oneOf(['left', 'center', 'right']),
    children: PropTypes.any,
    chromeless: PropTypes.any,
    className: PropTypes.string,
    disabled: PropTypes.any,
    disableTransitions: PropTypes.any,
    downloadFilename: PropTypes.any,
    downloadUrl: PropTypes.any,
    hover: PropTypes.any,
    icon: PropTypes.string,
    iconFlipHorizontal: PropTypes.any,
    iconPlacement: PropTypes.oneOf(['left', 'right']),
    iconType: PropTypes.string,
    label: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
    link: PropTypes.string,
    look: PropTypes.oneOf(['default', 'highlight', 'transparent', 'add', 'apply', 'cancel']),
    ref: PropTypes.object,
    shape: PropTypes.oneOf(['rectangle', 'pill', 'circle', 'none']),
    shown: PropTypes.any,
    size: PropTypes.oneOf(['small', 'normal', 'large', 'x-large', 'xx-large']),
    stopPropagation: PropTypes.any,
    tabIndex: PropTypes.number,
    tooltip: PropTypes.string,
    tooltipDisabled: PropTypes.any,
    tooltipPlacement: PropTypes.oneOf(['top', 'bottom', 'left', 'right']),
    type: PropTypes.oneOf(['button', 'submit', 'reset']),
    width: PropTypes.oneOf(['fit', 'fill']),
    onClick: PropTypes.func,
    onClickHold: PropTypes.func,
    onMouseDown: PropTypes.func,
    onMouseOut: PropTypes.func,
    onMouseOver: PropTypes.func
}

Button.defaultProps = {
    alignment: 'center',
    iconPlacement: 'left',
    look: 'default',
    shape: 'rectangle',
    shown: true,
    size: 'normal',
    type: 'button',
    width: 'fit'
}

export const ButtonGroup = ({children, type, className}) =>
    <div className={[styles.groupContainer, className].join(' ')}>
        <div className={[
            styles.group,
            type.split('-').map(className => styles[className]).join(' ')
        ].join(' ')}>
            {children}
        </div>
    </div>

ButtonGroup.propTypes = {
    children: PropTypes.any.isRequired,
    className: PropTypes.string,
    type: PropTypes.oneOf([
        'horizontal-wrap', 'horizontal-wrap-fill',
        'horizontal-nowrap', 'horizontal-nowrap-fill',
        'horizontal-tight',
        'vertical', 'vertical-tight'
    ])
}

ButtonGroup.defaultProps = {
    type: 'horizontal-wrap'
}
