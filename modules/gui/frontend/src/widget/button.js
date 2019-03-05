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

const CLICK_HOLD_DELAY_MS = 750
const CLICK_CANCEL_DELAY_MS = 250

const windowMouseUp$ = fromEvent(window, 'mouseup').pipe(distinctUntilChanged())

export class Button extends React.Component {
    button = React.createRef()
    subscriptions = []

    stopPropagation() {
        const {link, stopPropagation = !link} = this.props
        return stopPropagation
    }

    active() {
        const {shown = true, disabled = false} = this.props
        return shown && !disabled
    }

    linked() {
        const {onMouseDown, onClick, onClickHold, link, downloadUrl} = this.props
        return onMouseDown || onClick || onClickHold || link || downloadUrl
    }

    nonInteractive() {
        return !this.active() || !this.linked()
    }

    classNames() {
        const {
            chromeless,
            className,
            additionalClassName,
            look = 'default',
            size = 'normal',
            shape = 'rectangle',
            onClickHold
        } = this.props
        return className ? className : [
            styles.button,
            chromeless ? styles.chromeless : null,
            styles[size],
            styles[shape],
            lookStyles.look,
            lookStyles[look],
            chromeless ? lookStyles.chromeless : null,
            this.nonInteractive() ? lookStyles.nonInteractive : null,
            onClickHold ? styles.hold : null,
            additionalClassName
        ].join(' ')
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
        const {link, shown = true, disabled} = this.props
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
        const {type = 'button', tabIndex, disabled, onClickHold} = this.props
        return (
            <button
                type={type}
                className={this.classNames()}
                tabIndex={tabIndex}
                disabled={disabled}
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
        const {icon, iconPlacement = 'left', label, children} = this.props
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

Button.propTypes = {
    additionalClassName: PropTypes.string,
    children: PropTypes.any,
    chromeless: PropTypes.any,
    className: PropTypes.string,
    disabled: PropTypes.any,
    downloadFilename: PropTypes.any,
    downloadUrl: PropTypes.any,
    icon: PropTypes.string,
    iconFlipHorizontal: PropTypes.any,
    iconPlacement: PropTypes.oneOf(['left', 'right']),
    iconType: PropTypes.string,
    label: PropTypes.string,
    link: PropTypes.string,
    look: PropTypes.oneOf(['default', 'highlight', 'transparent', 'add', 'apply', 'cancel']),
    shape: PropTypes.oneOf(['rectangle', 'pill', 'circle', 'none']),
    shown: PropTypes.any,
    size: PropTypes.oneOf(['small', 'normal', 'large', 'x-large', 'xx-large']),
    stopPropagation: PropTypes.any,
    tabIndex: PropTypes.number,
    tooltip: PropTypes.string,
    tooltipDisabled: PropTypes.any,
    tooltipPlacement: PropTypes.oneOf(['top', 'bottom', 'left', 'right']),
    type: PropTypes.oneOf(['button', 'submit', 'reset']),
    onClick: PropTypes.func,
    onClickHold: PropTypes.func,
    onMouseDown: PropTypes.func
}

export const ButtonGroup = ({children, type = 'horizontal-wrap', className}) =>
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
    ]),
    vertical: PropTypes.any,
    wrap: PropTypes.any
}
