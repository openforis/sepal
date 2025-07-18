import _ from 'lodash'
import PropTypes from 'prop-types'
import React from 'react'
import {animationFrames, concatWith, delay, distinctUntilChanged, EMPTY, filter, fromEvent, map, merge, of, sample, scan, shareReplay, Subject, switchMap, takeUntil, takeWhile} from 'rxjs'

import {compose} from '~/compose'
import {asFunctionalComponent} from '~/classComponent'
import {withSubscriptions} from '~/subscription'
import {Keybinding} from '~/widget/keybinding'

import {isOverElementDeep} from './dom'
import {Draggable} from './draggable'
import {ElementResizeDetector} from './elementResizeDetector'
import {withEventShield} from './eventShield'
import flexy from './flexy.module.css'
import styles from './scrollable.module.css'

const ScrollableContext = React.createContext()

const ANIMATION_SPEED = .2
const PIXEL_PER_LINE = 45
const MIN_HANDLE_SIZE = 30
const MOUSE_AWAY_TIMEOUT_MS = 750

const lerp = rate =>
    (value, targetValue) => value + (targetValue - value) * rate

class _Scrollable extends React.PureComponent {
    constructor(props) {
        super(props)
        this.containerRef = props.forwardedRef || React.createRef()
        this.scrollableRef = React.createRef()
        this.getContainerElement = this.getContainerElement.bind(this)
        this.getScrollableElement = this.getScrollableElement.bind(this)
        this.getScrollTop = this.getScrollTop.bind(this)
        this.getScrollLeft = this.getScrollLeft.bind(this)
        this.setScrollTop = this.setScrollTop.bind(this)
        this.setScrollLeft = this.setScrollLeft.bind(this)
        this.centerElement = this.centerElement.bind(this)
        this.scrollElement = this.scrollElement.bind(this)
        this.onVerticalDragStart = this.onVerticalDragStart.bind(this)
        this.onVerticalDrag = this.onVerticalDrag.bind(this)
        this.onVerticalDragEnd = this.onVerticalDragEnd.bind(this)
        this.onHorizontalDragStart = this.onHorizontalDragStart.bind(this)
        this.onHorizontalDrag = this.onHorizontalDrag.bind(this)
        this.onHorizontalDragEnd = this.onHorizontalDragEnd.bind(this)
        this.scrollLineUp = this.scrollLineUp.bind(this)
        this.scrollLineDown = this.scrollLineDown.bind(this)
        this.scrollPageUp = this.scrollPageUp.bind(this)
        this.scrollPageDown = this.scrollPageDown.bind(this)
        this.scrollPageLeft = this.scrollPageLeft.bind(this)
        this.scrollPageRight = this.scrollPageRight.bind(this)
    }

    verticalScroll$ = new Subject()
    horizontalScroll$ = new Subject()
    resize$ = new Subject()
    dragging$ = new Subject()
    mouseWheel$ = new Subject()
    mouseAway$ = new Subject()

    state = {
        size: {},
        key: null,
        verticalDragging: false,
        horizontalDragging: false,
        scrolling: false,
        dragging: false,
        scrollbarTop: 0,
        scrollbarBottom: 0,
        scrollbarLeft: 0,
        scrollbarRight: 0,
        verticalFactor: 1,
        horizontalFactor: 1,
        clientHeight: 0,
        clientWidth: 0,
        scrollHeight: 0,
        scrollWidth: 0,
        scrollTop: 0,
        scrollLeft: 0
    }

    render() {
        const {containerClassName} = this.props
        return (
            <ElementResizeDetector targetRef={this.containerRef} resize$={this.resize$}>
                <div
                    ref={this.containerRef}
                    className={[
                        flexy.container,
                        styles.container,
                        containerClassName
                    ].join(' ')}>
                    {this.renderScrollable()}
                    {this.renderHorizontalScrollbar()}
                    {this.renderVerticalScrollbar()}
                </div>
            </ElementResizeDetector>
        )
    }

    renderScrollable() {
        const {key, className, direction, noKeyboard} = this.props
        const {dragging, scrolling, clientHeight, clientWidth, scrollHeight, scrollWidth, scrollTop, scrollLeft} = this.state
        const scrollable = {
            dragging,
            scrolling,
            clientHeight,
            clientWidth,
            scrollHeight,
            scrollWidth,
            scrollTop,
            scrollLeft,
            setScrollTop: this.setScrollTop,
            setScrollLeft: this.setScrollLeft,
            centerElement: this.centerElement,
            scrollElement: this.scrollElement,
            getElement: this.getScrollableElement,
            mouseAway$: this.mouseAway$
        }
        const keymap = !noKeyboard && ['y', 'xy'].includes(direction) ? {
            ArrowUp: this.scrollLineUp,
            ArrowDown: this.scrollLineDown,
            PageUp: this.scrollPageUp,
            PageDown: this.scrollPageDown
        } : null
        // "Space" keybinding disabled because it interferes with Input's keybinding in Combo
        return (
            <div
                key={key}
                ref={this.scrollableRef}
                className={[
                    flexy.elastic,
                    styles.scrollable,
                    styles[`direction-${direction}`],
                    className
                ].join(' ')}>
                <ScrollableContext.Provider value={scrollable}>
                    <Keybinding keymap={keymap}>
                        {this.renderContent(scrollable)}
                    </Keybinding>
                </ScrollableContext.Provider>
            </div>
        )
    }

    renderContent(scrollable) {
        const {children} = this.props
        return _.isFunction(children)
            ? children(scrollable)
            : children
    }

    renderVerticalScrollbar() {
        const {scrollbarTop, scrollbarBottom, clientHeight} = this.state
        return scrollbarTop || scrollbarBottom ? (
            <div>
                {this.renderVerticalScrollbarFiller(0, clientHeight - scrollbarTop, this.scrollPageUp)}
                {this.renderVerticalScrollbarHandle()}
                {this.renderVerticalScrollbarFiller(clientHeight - scrollbarBottom, 0, this.scrollPageDown)}
            </div>
        ) : null
    }

    renderVerticalScrollbarFiller(top, bottom, onClick) {
        return top || bottom ? (
            <div
                className={[
                    styles.scrollbar,
                    styles.filler,
                    styles.vertical
                ].join(' ')}
                style={{
                    '--top': top,
                    '--bottom': bottom,
                }}
                onClick={onClick}
            />
        ) : null
    }

    renderVerticalScrollbarHandle() {
        const {scrollbarTop, scrollbarBottom, verticalDragging, scrolling} = this.state
        return (
            <Draggable
                className={[
                    styles.scrollbar,
                    styles.handle,
                    styles.vertical,
                    verticalDragging ? styles.dragging : null,
                    scrolling ? styles.scrolling : null
                ].join(' ')}
                style={{
                    '--top': scrollbarTop,
                    '--bottom': scrollbarBottom,
                }}
                onDragStart={this.onVerticalDragStart}
                onDrag={this.onVerticalDrag}
                onDragEnd={this.onVerticalDragEnd}
            />
        )
    }

    renderHorizontalScrollbar() {
        const {scrollbarLeft, scrollbarRight, clientWidth} = this.state
        return scrollbarLeft || scrollbarRight ? (
            <div>
                {this.renderHorizontalFiller(0, clientWidth - scrollbarLeft, this.scrollPageLeft)}
                {this.renderHorizontalScrollbarHandle()}
                {this.renderHorizontalFiller(clientWidth - scrollbarRight, 0, this.scrollPageRight)}
            </div>
        ) : null
    }

    renderHorizontalFiller(left, right, onClick) {
        return left || right ? (
            <div
                className={[
                    styles.scrollbar,
                    styles.filler,
                    styles.horizontal
                ].join(' ')}
                style={{
                    '--left': left,
                    '--right': right,
                }}
                onClick={onClick}
            />
        ) : null
    }

    renderHorizontalScrollbarHandle() {
        const {scrollbarLeft, scrollbarRight, horizontalDragging, scrolling} = this.state
        return (
            <Draggable
                className={[
                    styles.scrollbar,
                    styles.handle,
                    styles.horizontal,
                    horizontalDragging ? styles.dragging : null,
                    scrolling ? styles.scrolling : null
                ].join(' ')}
                style={{
                    '--left': scrollbarLeft,
                    '--right': scrollbarRight,
                }}
                onDragStart={this.onHorizontalDragStart}
                onDrag={this.onHorizontalDrag}
                onDragEnd={this.onHorizontalDragEnd}
            />
        )
    }

    onVerticalDragStart() {
        this.setState(({scrollTop}) => ({
            verticalDragging: true,
            verticalOffset: scrollTop
        }))
    }

    onVerticalDrag({delta: {y}}) {
        const {verticalOffset, verticalFactor} = this.state
        this.setScrollTop(verticalOffset + y / verticalFactor)
        this.dragging$.next(true)
    }

    onVerticalDragEnd() {
        this.setState({
            verticalDragging: false,
            verticalOffset: null
        })
        this.dragging$.next(false)
    }

    onHorizontalDragStart() {
        this.setState(({scrollLeft}) => ({
            horizontalDragging: true,
            horizontalOffset: scrollLeft
        }))
    }

    onHorizontalDrag({delta: {x}}) {
        const {horizontalOffset, horizontalFactor} = this.state
        this.setScrollLeft(horizontalOffset + x / horizontalFactor)
        this.dragging$.next(true)
    }

    onHorizontalDragEnd() {
        this.setState({
            horizontalDragging: false,
            horizontalOffset: null
        })
        this.dragging$.next(false)
    }

    getContainerElement() {
        return this.containerRef.current
    }

    getScrollableElement() {
        return this.scrollableRef.current
    }

    getScrollTop() {
        return this.getScrollableElement().scrollTop
    }

    getScrollLeft() {
        return this.getScrollableElement().scrollLeft
    }

    setScrollTop(offset) {
        this.getScrollableElement().scrollTop = offset
    }

    setScrollLeft(offset) {
        this.getScrollableElement().scrollLeft = offset
    }

    scrollTo(offset, direction = 'y') {
        if (direction === 'y') {
            this.verticalScroll$.next(offset)
        } else {
            this.horizontalScroll$.next(offset)
        }
    }

    scrollPage(pages, direction) {
        const {clientHeight} = this.state
        this.scrollTo(this.getScrollableElement().scrollTop + pages * clientHeight, direction)
    }

    scrollPageUp() {
        this.scrollPage(-1, 'y')
    }

    scrollPageDown() {
        this.scrollPage(1, 'y')
    }

    scrollPageLeft() {
        this.scrollPage(-1, 'x')
    }

    scrollPageRight() {
        this.scrollPage(1, 'x')
    }

    scrollLineUp() {
        this.scrollLine(-1)
    }

    scrollLineDown() {
        this.scrollLine(1)
    }

    scrollLine(lines) {
        this.scrollTo(this.getScrollableElement().scrollTop + lines * PIXEL_PER_LINE)
    }

    centerElement(element) {
        if (element) {
            this.scrollTo(element.offsetTop - (this.getScrollableElement().clientHeight - element.clientHeight) / 2)
        }
    }

    scrollElement(element) {
        element?.scrollIntoView({
            behavior: 'smooth',
            block: 'nearest'
        })
    }

    handleContentSize() {
        const {addSubscription} = this.props
        const config = {characterData: true, childList: true, subtree: true}
        const observer = new MutationObserver(() => this.resize$.next())
        observer.observe(this.getScrollableElement(), config)
        addSubscription(
            () => observer.disconnect()
        )
    }

    isDragging() {
        const {verticalDragging, horizontalDragging} = this.state
        return verticalDragging || horizontalDragging
    }

    smoothScroll$(scroll$, getOffset) {
        return scroll$.pipe(
            map(targetOffset => Math.round(targetOffset)),
            switchMap(targetOffset =>
                Math.round(getOffset()) === targetOffset
                    ? EMPTY
                    : animationFrames().pipe(
                        map(() => targetOffset),
                        scan(lerp(ANIMATION_SPEED), getOffset()),
                        map(offset => Math.round(offset)),
                        distinctUntilChanged(),
                        takeWhile(offset => offset !== targetOffset),
                        takeUntil(this.mouseWheel$)
                    )
            )
        )
    }

    handleScroll() {
        const {addSubscription} = this.props
        const verticalScroll$ = this.smoothScroll$(this.verticalScroll$, this.getScrollTop)
        const horizontalScroll$ = this.smoothScroll$(this.horizontalScroll$, this.getScrollLeft)
        addSubscription(
            verticalScroll$.subscribe(
                offset => this.setScrollTop(offset)
            ),
            horizontalScroll$.subscribe(
                offset => this.setScrollLeft(offset)
            )
        )
    }

    handleScrolling() {
        const {addSubscription} = this.props
        const scroll$ = fromEvent(this.getScrollableElement(), 'scroll')
        const update$ = merge(scroll$, this.resize$)
        const scrolling$ = scroll$.pipe(
            switchMap(() => of(true).pipe(
                concatWith(
                    of(false).pipe(
                        delay(50)
                    )
                )
            )),
            distinctUntilChanged()
        )
        const mouseWheel$ = fromEvent(this.getScrollableElement(), 'mousewheel')
        addSubscription(
            update$.subscribe(
                () => this.update()
            ),
            scrolling$.subscribe(
                scrolling => this.setState({scrolling})
            ),
            mouseWheel$.subscribe(
                () => this.mouseWheel$.next()
            )
        )
    }

    handleDragging() {
        const {addSubscription} = this.props
        const dragging$ = this.dragging$.pipe(
            switchMap(drag => of(drag).pipe(
                concatWith(
                    of(false).pipe(
                        delay(50)
                    )
                )
            )),
            distinctUntilChanged()
        )
        addSubscription(
            dragging$.subscribe(
                dragging => this.setState({dragging})
            )
        )
    }

    update() {
        const {direction} = this.props
        if (['y', 'xy'].includes(direction)) {
            this.updateVertical()
        }
        if (['x', 'xy'].includes(direction)) {
            this.updateHorizontal()
        }
    }

    updateVertical() {
        const {scrollTop, clientHeight, scrollHeight} = this.getScrollableElement()
        const overflowTop = scrollTop
        const overflowBottom = scrollHeight - clientHeight - scrollTop
        const verticalFactor = (clientHeight - MIN_HANDLE_SIZE) / scrollHeight
        const scrollbarTop = overflowTop * verticalFactor
        const scrollbarBottom = overflowBottom * verticalFactor
        this.setState({scrollbarTop, scrollbarBottom, verticalFactor, clientHeight, scrollHeight, scrollTop})
    }

    updateHorizontal() {
        const {scrollLeft, clientWidth, scrollWidth} = this.getScrollableElement()
        const overflowLeft = scrollLeft
        const overflowRight = scrollWidth - clientWidth - scrollLeft
        const horizontalFactor = (clientWidth - MIN_HANDLE_SIZE) / scrollWidth
        const scrollbarLeft = overflowLeft * horizontalFactor
        const scrollbarRight = overflowRight * horizontalFactor
        this.setState({scrollbarLeft, scrollbarRight, horizontalFactor, clientWidth, scrollWidth, scrollLeft})
    }

    isOver(e) {
        return isOverElementDeep(e, this.getContainerElement())
    }

    handleMouseAway() {
        const {addSubscription, eventShield} = this.props
        const over$ = fromEvent(document, 'mousemove').pipe(
            map(e => this.isOver(e)),
            distinctUntilChanged(),
            shareReplay({bufferSize: 1, refCount: true})
        )
        const enter$ = over$.pipe(
            filter(over => over)
        )
        const leave$ = eventShield.enabled$.pipe(
            switchMap(enabled => enabled
                ? over$.pipe(
                    sample(eventShield.enabled$.pipe(
                        filter(enabled => !enabled)
                    ))
                )
                : over$
            ),
            filter(over => !over)
        )
        const away$ = enter$.pipe(
            switchMap(() => leave$.pipe(
                delay(MOUSE_AWAY_TIMEOUT_MS)
            ))
        )
        addSubscription(
            away$.subscribe(
                away => this.mouseAway$.next(away)
            )
        )
    }

    componentDidMount() {
        this.handleContentSize()
        this.handleScroll()
        this.handleScrolling()
        this.handleDragging()
        this.handleMouseAway()
    }

    componentDidUpdate(_prevProps, prevState) {
        const {eventShield} = this.props
        const {verticalDragging, horizontalDragging} = this.state
        const dragging = verticalDragging || horizontalDragging
        const wasDragging = prevState.verticalDragging || prevState.horizontalDragging
        if (eventShield && dragging !== wasDragging) {
            eventShield.setEnabled(dragging)
        }
    }
}

export const Scrollable = compose(
    _Scrollable,
    withEventShield(),
    withSubscriptions(),
    asFunctionalComponent()
)

Scrollable.propTypes = {
    direction: PropTypes.oneOf(['x', 'y', 'xy']).isRequired,
    children: PropTypes.any,
    className: PropTypes.string,
    containerClassName: PropTypes.string,
    hideScrollbar: PropTypes.any,
    noKeyboard: PropTypes.any
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
