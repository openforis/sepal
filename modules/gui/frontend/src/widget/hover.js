import {compose} from 'compose'
import {delay, distinctUntilChanged, map, mapTo, switchMap, takeUntil, zip} from 'rxjs/operators'
import {fromEvent, merge, of} from 'rxjs'
import PropTypes from 'prop-types'
import React from 'react'
import styles from './hover.module.css'
import withSubscriptions from 'subscription'

const {Provider, Consumer} = React.createContext()

const windowTouchStart$ = fromEvent(window, 'touchstart')
const windowTouchEnd$ = fromEvent(window, 'touchend')

class _HoverDetector extends React.Component {
    state = {
        hover: false
    }

    ref = React.createRef()

    componentDidMount() {
        const {addSubscription} = this.props
        const element = this.ref.current
        const mouseOver$ = fromEvent(element, 'mouseover')
        const mouseLeave$ = fromEvent(element, 'mouseleave')
        const touchMove$ = fromEvent(element, 'touchmove')

        const mouseStatus$ = merge(
            mouseOver$.pipe(
                mapTo(true)
            ),
            mouseLeave$.pipe(
                mapTo(false)
            ),
            windowTouchStart$.pipe( // Cancel hover when touching outside of element
                switchMap(e =>
                    of(e).pipe(
                        zip(windowTouchEnd$),
                        map(([start, end]) =>
                            element.contains(start.target) && element.contains(end.target)
                        ),
                        takeUntil(touchMove$)
                    )
                )
            )
        ).pipe(
            distinctUntilChanged(),
            // [HACK] Prevent click-through on touch screens
            delay(100)
        )

        addSubscription(
            mouseStatus$.subscribe(hover => this.setState({hover}))
        )
    }

    render() {
        const {hover} = this.state
        const {className, children} = this.props
        return (
            <Provider value={hover}>
                <div ref={this.ref} className={className}>
                    {children}
                </div>
            </Provider>
        )
    }
}

export const HoverDetector = compose(
    _HoverDetector,
    withSubscriptions()
)

HoverDetector.propTypes = {
    children: PropTypes.any.isRequired,
    className: PropTypes.string
}

export const HoverOverlay = props =>
    <Consumer>
        {hover =>
            <div className={[styles.overlay, hover ? styles.hover : null].join(' ')}>
                {hover ? props.children : null}
            </div>
        }
    </Consumer>

HoverOverlay.propTypes = {
    children: PropTypes.any.isRequired
}
