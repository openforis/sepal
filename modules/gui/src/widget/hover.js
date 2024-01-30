import {compose} from 'compose'
import {delay, distinctUntilChanged, fromEvent, map, merge, of, switchMap, takeUntil, zipWith} from 'rxjs'
import {withSubscriptions} from 'subscription'
import PropTypes from 'prop-types'
import React from 'react'
import _ from 'lodash'
import styles from './hover.module.css'

const {Provider, Consumer} = React.createContext()

const windowTouchStart$ = fromEvent(window, 'touchstart')
const windowTouchEnd$ = fromEvent(window, 'touchend')
const windowTouchMove$ = fromEvent(window, 'touchmove')

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
                map(() => true)
            ),
            mouseLeave$.pipe(
                map(() => false)
            ),
            windowTouchMove$.pipe(
                map(e => {
                    const touch = e.touches[0]
                    const elementFromTouch = document.elementFromPoint(touch.clientX, touch.clientY)
                    return element.contains(elementFromTouch)
                })
            ),
            windowTouchStart$.pipe( // Cancel hover when touching outside of element
                switchMap(e =>
                    of(e).pipe(
                        zipWith(windowTouchEnd$),
                        map(([start, end]) =>
                            element.contains(start.target) && element.contains(end.target)
                        ),
                        takeUntil(touchMove$)
                    )
                )
            )
        ).pipe(
            distinctUntilChanged(),
            delay(100) // [HACK] Prevent click-through on touch screens
        )

        addSubscription(
            mouseStatus$.subscribe(hover => this.setHover(hover))
        )
    }

    setHover(hover) {
        const {onHover} = this.props
        this.setState({hover})
        onHover && onHover(hover)
    }

    render() {
        const {hover} = this.state
        const {className, children} = this.props
        return (
            <Provider value={hover}>
                <div ref={this.ref} className={className}>
                    {_.isFunction(children) ? children(hover) : children}
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
    className: PropTypes.string,
    onHover: PropTypes.func
}

export const HoverOverlay = props =>
    <Consumer>
        {hover =>
            <div className={[
                styles.overlay,
                hover ? styles.hover : null,
            ].join(' ')}>
                {hover ? props.children : null}
            </div>
        }
    </Consumer>

HoverOverlay.propTypes = {
    children: PropTypes.any.isRequired
}
