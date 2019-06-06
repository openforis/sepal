import {EMPTY, Subject, animationFrameScheduler, fromEvent, interval} from 'rxjs'
import {compose} from 'compose'
import {debounceTime, distinctUntilChanged, map, mapTo, scan, switchMap, takeWhile, withLatestFrom} from 'rxjs/operators'
import {disableBodyScroll, enableBodyScroll} from 'body-scroll-lock'
import {v4 as uuid} from 'uuid'
import PropTypes from 'prop-types'
import React, {Component} from 'react'
import _ from 'lodash'
import flexy from './flexy.module.css'
import styles from './scrollable.module.css'
import withSubscriptions from 'subscription'

const ScrollableContainerContext = React.createContext()

export class ScrollableContainer extends React.Component {
    ref = React.createRef()
    state = {
        height: 0
    }

    render() {
        const {className, children} = this.props
        const {height} = this.state
        return (
            <div ref={this.ref} className={[flexy.container, className].join(' ')}>
                <ScrollableContainerContext.Provider value={{height}}>
                    {children}
                </ScrollableContainerContext.Provider>
            </div>
        )
    }

    updateHeight(height) {
        this.setState(prevState => prevState.height !== height ? {height} : null)
    }

    componentDidUpdate() {
        this.updateHeight(this.ref.current.clientHeight)
    }
}

ScrollableContainer.propTypes = {
    children: PropTypes.any.isRequired,
    className: PropTypes.string
}

export const Unscrollable = ({className, children}) => {
    return (
        <div className={[flexy.rigid, className].join(' ')}>
            {children}
        </div>
    )
}

Unscrollable.propTypes = {
    children: PropTypes.any,
    className: PropTypes.string
}

const ScrollableContext = React.createContext()

const ANIMATION_SPEED = .2

const lerp = rate =>
    (value, targetValue) => value + (targetValue - value) * rate

class _Scrollable extends Component {
    ref = React.createRef()
    center$ = new Subject()

    state = {
        key: null
    }

    render() {
        return (
            <ScrollableContainerContext.Consumer>
                {({height}) => this.renderScrollable(height)}
            </ScrollableContainerContext.Consumer>
        )
    }

    renderScrollable(scrollableContainerHeight) {
        const {className, direction, children} = this.props
        const {key} = this.state
        const scrollable = {
            getOffset: this.getOffset.bind(this),
            getContainerHeight: this.getContainerHeight.bind(this),
            getClientHeight: this.getClientHeight.bind(this),
            getScrollableHeight: this.getScrollableHeight.bind(this),
            scrollTo: this.scrollTo.bind(this),
            scrollToTop: this.scrollToTop.bind(this),
            scrollToBottom: this.scrollToBottom.bind(this),
            reset: this.reset.bind(this),
            centerElement: this.centerElement.bind(this)
        }
        return (
            <div
                key={key}
                ref={this.ref}
                // onScroll={e => e.stopPropagation()}
                className={[flexy.elastic, styles.scrollable, styles[direction], className].join(' ')}>
                <ScrollableContext.Provider value={scrollable}>
                    {_.isFunction(children) ? children(scrollableContainerHeight, scrollable) : children}
                </ScrollableContext.Provider>
            </div>
        )
    }

    getScrollableElement() {
        return this.ref.current
    }

    getOffset() {
        return this.getScrollableElement().scrollTop
    }

    getContainerHeight() {
        return this.getScrollableElement().offsetHeight
    }

    getClientHeight() {
        return this.getScrollableElement().clientHeight
    }

    getScrollableHeight() {
        return this.getScrollableElement().scrollHeight
    }
 
    scrollTo(offset) {
        this.getScrollableElement().scrollTop = offset
    }

    scrollToTop() {
        this.scrollTo(0)
    }
    
    scrollToBottom() {
        this.scrollTo(this.getScrollableHeight() - this.getClientHeight())
    }
    
    reset(callback) {
        const offset = this.getOffset()
        this.setState({key: uuid()},
            () => {
                this.scrollTo(offset)
                callback()
            }
        )
    }

    centerElement(element) {
        element && this.center$.next(element)
    }

    handleHover() {
        const {onHover, addSubscription} = this.props
        if (onHover) {
            const mouseCoords$ = fromEvent(document, 'mousemove').pipe(
                map(e => ([e.clientX, e.clientY]))
            )
            const debouncedScroll$ = fromEvent(this.ref.current, 'scroll').pipe(
                debounceTime(50)
            )
            const highlight$ = debouncedScroll$.pipe(
                withLatestFrom(mouseCoords$),
                map(([, [x, y]]) => document.elementFromPoint(x, y)),
                distinctUntilChanged()
            )
            addSubscription(
                highlight$.subscribe(
                    element => onHover(element)
                )
            )
        }
    }

    handleCentering() {
        const {addSubscription} = this.props
        const animationFrame$ = interval(0, animationFrameScheduler)

        const scroll$ = this.center$.pipe(
            switchMap(element => {
                const target = Math.round(element.offsetTop - (this.getClientHeight() - element.clientHeight) / 2)
                return Math.round(this.getOffset()) === target
                    ? EMPTY
                    : animationFrame$.pipe(
                        mapTo(target),
                        scan(lerp(ANIMATION_SPEED), this.getOffset()),
                        map(value => Math.round(value)),
                        distinctUntilChanged(),
                        map(value => ({value, scrolling: value !== target})),
                        takeWhile(({scrolling}) => scrolling, true)
                    )
            })
        )

        const autoCenter$ = scroll$.pipe(
            map(({value}) => value)
        )

        const scrolling$ = scroll$.pipe(
            map(({scrolling}) => scrolling),
            distinctUntilChanged()
        )

        addSubscription(
            autoCenter$.subscribe(
                value => this.scrollTo(value)
            ),
            scrolling$.subscribe(
                autoScrolling => this.setState({autoScrolling})
            )
        )
    }

    componentDidMount() {
        disableBodyScroll(this.ref.current)
        this.handleHover()
        this.handleCentering()
    }

    componentWillUnmount() {
        enableBodyScroll(this.ref.current)
    }
}

export const Scrollable = compose(
    _Scrollable,
    withSubscriptions()
)

Scrollable.defaultProps = {direction: 'y'}

Scrollable.propTypes = {
    children: PropTypes.any,
    className: PropTypes.string,
    direction: PropTypes.oneOf(['x', 'y', 'xy']),
    onScroll: PropTypes.func
}

export const withScrollable = () =>
    WrappedComponent =>
        class HigherOrderComponent extends React.Component {
            render() {
                return (
                    <ScrollableContext.Consumer>
                        {scrollable =>
                            <WrappedComponent {...this.props} scrollable={scrollable}/>
                        }
                    </ScrollableContext.Consumer>
                )
            }
        }

const ScrollableRef = children =>
    <ScrollableContext.Consumer>
        {scrollable =>
            children(scrollable)
        }
    </ScrollableContext.Consumer>

ScrollableRef.propTypes = {
    children: PropTypes.func.isRequired
}
