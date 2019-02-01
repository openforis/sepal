import PropTypes from 'prop-types'
import React from 'react'
import {fromEvent, merge, of} from 'rxjs'
import {delay, distinctUntilChanged, map, switchMap, takeUntil, zip} from 'rxjs/operators'
import styles from './hover.module.css'

const {Provider, Consumer} = React.createContext()

const windowTouchStart$ = fromEvent(window, 'touchstart')
const windowTouchEnd$ = fromEvent(window, 'touchend')

export class HoverDetector extends React.Component {
    state = {
        hover: false
    }

    ref = React.createRef()
    subscriptions = []

    componentDidMount() {
        const element = this.ref.current
        const mouseOver$ = fromEvent(element, 'mouseover')
        const mouseLeave$ = fromEvent(element, 'mouseleave')
        const touchMove$ = fromEvent(element, 'touchmove')

        const mouseStatus$ = merge(
            mouseOver$.pipe(
                map(() => true)
            ),
            mouseLeave$.pipe(
                map(() => false)
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
            // [HACK] Prevent click-through on Android devices
            delay(0)
        )

        this.subscriptions.push(
            mouseStatus$.subscribe(hover => this.setState({hover}))
        )
    }

    componentWillUnmount() {
        this.subscriptions.forEach(subscription => subscription.unsubscribe())
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
