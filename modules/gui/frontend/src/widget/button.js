import {Link} from 'route'
import {combineLatest, fromEvent, merge, timer} from 'rxjs'
import {switchMap, take, takeUntil} from 'rxjs/operators'
import Icon from 'widget/icon'
import PropTypes from 'prop-types'
import React from 'react'
import Tooltip from 'widget/tooltip'
import lookStyles from 'style/look.module.css'
import styles from './button.module.css'

const CLICK_HOLD_DELAY_MS = 750

const windowMouseUp$ = merge(fromEvent(window, 'mouseup'), fromEvent(window, 'touchend'))

const download = (url, filename) => {
    // create hidden anchor, attach to DOM, click it and remove it from the DOM
    var downloadElement = document.createElement('a')
    downloadElement.setAttribute('style', 'display: none')
    downloadElement.setAttribute('href', url)
    downloadElement.setAttribute('download', filename)
    document.body.appendChild(downloadElement)
    downloadElement.click()
    downloadElement.remove()
}

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

    // Make sure there is a DOM element above the tooltip with the ref.
    // The tooltip masks events.
    renderWrapper(contents) {
        const {onClick, onClickHold} = this.props
        return onClick || onClickHold ? (
            <span ref={this.button} className={styles.wrapper}>
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
        const style = onClickHold ? {'--click-hold-delay-ms': `${CLICK_HOLD_DELAY_MS}ms`} : null
        return (
            <button
                type={type}
                className={this.classNames()}
                style={style}
                tabIndex={tabIndex}
                disabled={disabled}
                onMouseDown={e => this.handleMouseDown(e)}
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
        return (
            this.renderWrapper(
                this.renderLink(
                    this.renderTooltip(
                        this.renderButton(
                            this.renderContents()
                        )
                    )
                )
            )
        )
    }

    componentDidMount() {
        const {onClick, onClickHold} = this.props

        const button = this.button.current

        const buttonMouseDown$ = fromEvent(button, 'mousedown')
        const buttonMouseEnter$ = fromEvent(button, 'mouseenter')
        const buttonMouseUp$ = fromEvent(button, 'mouseup')
        const touchStart$ = fromEvent(button, 'touchstart')
        const touchEnd$ = fromEvent(button, 'touchend')

        const cancel$ = windowMouseUp$
        const mouseTrigger$ = combineLatest(buttonMouseDown$, buttonMouseEnter$)
        const mouseActivate$ = buttonMouseUp$
        const touchTrigger$ = touchStart$
        const touchActivate$ = touchEnd$

        if (onClick) {
            const touch$ =
                touchTrigger$.pipe(
                    switchMap(() =>
                        touchActivate$.pipe(
                            takeUntil(cancel$),
                            take(1)
                        )
                    )
                )

            const click$ =
                mouseTrigger$.pipe(
                    switchMap(() =>
                        mouseActivate$.pipe(
                            takeUntil(cancel$),
                            take(1)
                        )
                    )
                )

            this.subscriptions.push(
                touch$.subscribe(e => {
                    const {onClick, disabled} = this.props
                    e.preventDefault()
                    if (onClick && !disabled) {
                        this.handleClick(e)
                    }
                })
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

        if (onClickHold) {
            const touchHold$ =
                touchTrigger$.pipe(
                    switchMap(() =>
                        timer(CLICK_HOLD_DELAY_MS).pipe(
                            takeUntil(cancel$),
                            switchMap(() =>
                                touchActivate$.pipe(
                                    takeUntil(cancel$),
                                    take(1)
                                )
                            )
                        )
                    )
                )

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
                touchHold$.subscribe(e => {
                    const {onClickHold, disabled} = this.props
                    e.preventDefault()
                    if (onClickHold && !disabled) {
                        this.handleClickHold(e)
                    }
                })
            )

            this.subscriptions.push(
                clickHold$.subscribe(e => {
                    const {onClickHold, disabled} = this.props
                    if (onClickHold && !disabled) {
                        this.handleClickHold(e)
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
    <div className={[
        styles.group,
        styles[type],
        className
    ].join(' ')}>
        {children}
    </div>

ButtonGroup.propTypes = {
    children: PropTypes.any.isRequired,
    className: PropTypes.string,
    type: PropTypes.oneOf(['horizontal-wrap', 'horizontal-nowrap', 'horizontal-tight', 'vertical']),
    vertical: PropTypes.any,
    wrap: PropTypes.any
}
