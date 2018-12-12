import {combineLatest, fromEvent, merge, timer} from 'rxjs'
import {switchMap, take, takeUntil} from 'rxjs/operators'
import PropTypes from 'prop-types'
import React from 'react'

const DELAY_MS = 750

export class HoldButton extends React.Component {
    button = React.createRef()
    subscriptions = []

    render() {
        const {type, className, style, tabIndex, disabled, onMouseDown, onClick, children} = this.props
        return (
            <button
                ref={this.button}
                type={type}
                className={className}
                style={style}
                tabIndex={tabIndex}
                disabled={disabled}
                onMouseDown={onMouseDown}
                onClick={onClick}
            >
                {children}
            </button>
        )
    }

    componentDidMount() {
        const {onClickHold} = this.props
        if (onClickHold) {
            const button = this.button.current
            const buttonMouseDown$ = merge(fromEvent(button, 'mousedown'), fromEvent(button, 'touchstart'))
            const buttonMouseEnter$ = fromEvent(button, 'mouseenter')
            const buttonMouseUp$ = merge(fromEvent(button, 'mouseup'), fromEvent(button, 'touchend'))
            const windowMouseUp$ = merge(fromEvent(window, 'mouseup'), fromEvent(window, 'touchend'))

            const trigger$ = combineLatest(buttonMouseDown$, buttonMouseEnter$)
            const cancel$ = windowMouseUp$
            const activate$ = buttonMouseUp$

            const clickHold$ =
                trigger$.pipe(
                    switchMap(() => {
                        return timer(DELAY_MS).pipe(
                            takeUntil(cancel$),
                            switchMap(() =>
                                activate$.pipe(
                                    takeUntil(cancel$),
                                    take(1)
                                )
                            )
                        )
                    })
                )
            
            this.subscriptions.push(
                clickHold$.subscribe(e => {
                    const {onClickHold, disabled} = this.props
                    if (onClickHold && !disabled)
                        onClickHold(e)
                })
            )
        }
    }

    componentWillUnmount() {
        this.subscriptions.forEach(subscription => subscription.unsubscribe())
    }
}

HoldButton.propTypes = {
    children: PropTypes.any,
    className: PropTypes.string,
    disabled: PropTypes.any,
    style: PropTypes.any,
    tabIndex: PropTypes.number,
    type: PropTypes.string,
    onClick: PropTypes.func,
    onClickHold: PropTypes.func,
    onMouseDown: PropTypes.func,
}
