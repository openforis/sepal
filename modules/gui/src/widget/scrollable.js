import {EMPTY, Subject, animationFrames, debounceTime, distinctUntilChanged, fromEvent, map, scan, switchMap, takeWhile, withLatestFrom} from 'rxjs'
import {compose} from 'compose'
import {v4 as uuid} from 'uuid'
import {withSubscriptions} from 'subscription'
import Keybinding from 'widget/keybinding'
import PropTypes from 'prop-types'
import React, {Component} from 'react'
import _ from 'lodash'
import flexy from './flexy.module.css'
import styles from './scrollable.module.css'

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
        <div className={[flexy.rigid, styles.unscrollable, className].join(' ')}>
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
const PIXEL_PER_LINE = 45

const lerp = rate =>
    (value, targetValue) => value + (targetValue - value) * rate

class _Scrollable extends Component {
    ref = React.createRef()
    verticalScroll$ = new Subject()
    horizontalScroll$ = new Subject()

    state = {
        key: null
    }

    constructor() {
        super()
        this.renderScrollable = this.renderScrollable.bind(this)
    }

    render() {
        return (
            <ScrollableContainerContext.Consumer>
                {this.renderScrollable}
            </ScrollableContainerContext.Consumer>
        )
    }

    renderScrollable({height}) {
        const {className, direction, hideScrollbar, children} = this.props
        const {key} = this.state
        const scrollable = {
            containerHeight: height,
            getOffset: (direction = 'y') => this.getOffset(direction),
            getContainerHeight: this.getContainerHeight.bind(this),
            getClientHeight: this.getClientHeight.bind(this),
            getScrollableHeight: this.getScrollableHeight.bind(this),
            setOffset: this.setOffset.bind(this),
            scrollTo: this.scrollTo.bind(this),
            scrollToTop: this.scrollToTop.bind(this),
            scrollToBottom: this.scrollToBottom.bind(this),
            scrollPage: this.scrollPage.bind(this),
            scrollLine: this.scrollLine.bind(this),
            reset: this.reset.bind(this),
            centerElement: this.centerElement.bind(this),
            scrollElement: this.scrollElement.bind(this),
            getElement: this.getScrollableElement.bind(this)
        }
        const keymap = ['y', 'xy'].includes(direction) ? {
            ArrowUp: () => scrollable.scrollLine(-1),
            ArrowDown: () => scrollable.scrollLine(1),
            'Shift+ ': () => scrollable.scrollPage(-1),
            ' ': () => scrollable.scrollPage(1)
        } : null
        return (
            <div
                key={key}
                ref={this.ref}
                className={[
                    flexy.elastic,
                    styles.scrollable,
                    styles[direction],
                    hideScrollbar ? styles.hideScrollbar : null,
                    className
                ].join(' ')}>
                <ScrollableContext.Provider value={scrollable}>
                    <Keybinding keymap={keymap}>
                        {_.isFunction(children) ? children(scrollable) : children}
                    </Keybinding>
                </ScrollableContext.Provider>
            </div>
        )
    }

    getScrollableElement() {
        return this.ref.current
    }

    setOffset(offset, direction = 'y') {
        if (direction === 'y') {
            this.getScrollableElement().scrollTop = offset
        } else {
            this.getScrollableElement().scrollLeft = offset
        }
    }

    getOffset(direction) {
        if (direction === 'y') {
            return this.getScrollableElement().scrollTop
        } else {
            return this.getScrollableElement().scrollLeft
        }
    }

    getContainerHeight() {
        return this.getScrollableElement().offsetHeight
    }

    getClientHeight() {
        return this.getScrollableElement().clientHeight
    }

    getClientWidth() {
        return this.getScrollableElement().clientWidth
    }

    getScrollableHeight() {
        return this.getScrollableElement().scrollHeight
    }

    getScrollableWidth() {
        return this.getScrollableElement().scrollWidth
    }

    scrollTo(offset, direction = 'y') {
        if (direction === 'y') {
            this.verticalScroll$.next(offset)
        } else {
            this.horizontalScroll$.next(offset)
        }
    }

    scrollToTop() {
        this.scrollTo(0)
    }

    scrollToBottom() {
        this.scrollTo(this.getScrollableHeight() - this.getClientHeight())
    }

    scrollPage(pages) {
        this.scrollTo(this.getScrollableElement().scrollTop + pages * this.getClientHeight())
    }

    scrollLine(lines) {
        this.scrollTo(this.getScrollableElement().scrollTop + lines * PIXEL_PER_LINE)
    }

    centerElement(element) {
        if (element) {
            this.scrollTo(element.offsetTop - (this.getClientHeight() - element.clientHeight) / 2)
        }
    }

    scrollElement(element) {
        element?.scrollIntoView({
            behavior: 'smooth',
            block: 'nearest'
        })
    }

    reset(callback) {
        const verticalOffset = this.getOffset('y')
        const horizontalOffset = this.getOffset('x')
        this.setState({key: uuid()},
            () => {
                this.setOffset(verticalOffset, 'y')
                this.setOffset(horizontalOffset, 'x')
                callback()
            }
        )
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

    handleScroll() {
        const {addSubscription} = this.props

        const scroll$ = (scroll$, direction) => scroll$.pipe(
            map(targetOffset => Math.round(targetOffset)),
            switchMap(targetOffset =>
                Math.round(this.getOffset(direction)) === targetOffset
                    ? EMPTY
                    : animationFrames().pipe(
                        map(() => targetOffset),
                        scan(lerp(ANIMATION_SPEED), this.getOffset(direction)),
                        map(offset => Math.round(offset)),
                        distinctUntilChanged(),
                        takeWhile(offset => offset !== targetOffset)
                    )
            )
        )

        addSubscription(
            scroll$(this.verticalScroll$, 'y').subscribe(
                offset => this.setOffset(offset, 'y')
            ),
            scroll$(this.horizontalScroll$, 'x').subscribe(
                offset => this.setOffset(offset, 'x')
            )
        )
    }

    componentDidMount() {
        this.handleHover()
        this.handleScroll()
    }
}

export const Scrollable = compose(
    _Scrollable,
    withSubscriptions()
)

Scrollable.defaultProps = {
    direction: 'y'
}

Scrollable.propTypes = {
    children: PropTypes.any,
    className: PropTypes.string,
    direction: PropTypes.oneOf(['x', 'y', 'xy']),
    hideScrollbar: PropTypes.any,
    onScroll: PropTypes.func
}

export const withScrollable = () =>
    WrappedComponent =>
        class WithScrollableHOC extends React.Component {
            constructor() {
                super()
                this.renderScrollable = this.renderScrollable.bind(this)
            }

            render() {
                return (
                    <ScrollableContext.Consumer>
                        {this.renderScrollable}
                    </ScrollableContext.Consumer>
                )
            }

            renderScrollable(scrollable) {
                return (
                    <WrappedComponent {...this.props} scrollable={scrollable}/>
                )
            }
        }
