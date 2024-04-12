import {Draggable} from './draggable'
import {EMPTY, Subject, animationFrames, concatWith, debounceTime, delay, distinctUntilChanged, fromEvent, map, mergeWith, of, scan, switchMap, takeUntil, takeWhile, timer, withLatestFrom} from 'rxjs'
import {ElementResizeDetector} from './elementResizeDetector'
import {Keybinding} from '~/widget/keybinding'
import {compose} from '~/compose'
import {withEventShield} from './eventShield'
import {withSubscriptions} from '~/subscription'
import PropTypes from 'prop-types'
import React from 'react'
import _ from 'lodash'
import flexy from './flexy.module.css'
import styles from './scrollable.module.css'

const ScrollableContext = React.createContext()

const ANIMATION_SPEED = .2
const PIXEL_PER_LINE = 45
const MIN_HANDLE_SIZE = 30

const lerp = rate =>
    (value, targetValue) => value + (targetValue - value) * rate

class _Scrollable extends React.PureComponent {
    ref = React.createRef()
    verticalScroll$ = new Subject()
    horizontalScroll$ = new Subject()
    resize$ = new Subject()
    dragging$ = new Subject()

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

    constructor() {
        super()
        this.getElement = this.getElement.bind(this)
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
        this.scrollPageUp = this.scrollPageUp.bind(this)
        this.scrollPageDown = this.scrollPageDown.bind(this)
        this.scrollPageLeft = this.scrollPageLeft.bind(this)
        this.scrollPageRight = this.scrollPageRight.bind(this)
    }

    render() {
        const {containerClassName} = this.props
        return (
            <ElementResizeDetector resize$={this.resize$}>
                <div className={[
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
            getElement: this.getElement
        }
        const keymap = !noKeyboard && ['y', 'xy'].includes(direction) ? {
            ArrowUp: () => this.scrollLine(-1),
            ArrowDown: () => this.scrollLine(1),
            // 'Shift+ ': () => scrollable.scrollPage(-1),
            // ' ': () => scrollable.scrollPage(1)
        } : null
        // "Space" keybinding disabled because it interferes with Input's keybinding in Combo
        return (
            <div
                key={key}
                ref={this.ref}
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
        this.dragging$.next()
    }

    onVerticalDragEnd() {
        this.setState({
            verticalDragging: false,
            verticalOffset: null
        })
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
        this.dragging$.next()
    }

    onHorizontalDragEnd() {
        this.setState({
            horizontalDragging: false,
            horizontalOffset: null
        })
    }

    getElement() {
        return this.ref.current
    }

    getScrollTop() {
        return this.getElement().scrollTop
    }

    getScrollLeft() {
        return this.getElement().scrollLeft
    }

    setScrollTop(offset) {
        this.getElement().scrollTop = offset
    }

    setScrollLeft(offset) {
        this.getElement().scrollLeft = offset
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
        this.scrollTo(this.getElement().scrollTop + pages * clientHeight, direction)
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

    scrollLine(lines) {
        this.scrollTo(this.getElement().scrollTop + lines * PIXEL_PER_LINE)
    }

    centerElement(element) {
        if (element) {
            this.scrollTo(element.offsetTop - (this.getElement().clientHeight - element.clientHeight) / 2)
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
        const content = this.ref.current
        const config = {characterData: true, childList: true, subtree: true}
        const observer = new MutationObserver(() => this.resize$.next())
        observer.observe(content, config)
        addSubscription(
            () => observer.disconnect()
        )
    }

    handleHover() {
        const {onHover, addSubscription} = this.props
        if (onHover) {
            const mouseCoords$ = fromEvent(document, 'mousemove').pipe(
                map(e => ([e.clientX, e.clientY]))
            )
            const debouncedScroll$ = fromEvent(this.getElement(), 'scroll').pipe(
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
        const smoothScroll$ = (scroll$, getOffset) => scroll$.pipe(
            map(targetOffset => Math.round(targetOffset)),
            switchMap(targetOffset =>
                Math.round(getOffset()) === targetOffset
                    ? EMPTY
                    : animationFrames().pipe(
                        map(() => targetOffset),
                        scan(lerp(ANIMATION_SPEED), getOffset()),
                        map(offset => Math.round(offset)),
                        distinctUntilChanged(),
                        takeWhile(offset => offset !== targetOffset)
                    )
            )
        )
        const verticalScroll$ = smoothScroll$(this.verticalScroll$, this.getScrollTop)
        const horizontalScroll$ = smoothScroll$(this.horizontalScroll$, this.getScrollLeft)
        addSubscription(
            verticalScroll$.subscribe(
                offset => this.setScrollTop(offset)
            ),
            horizontalScroll$.subscribe(
                offset => this.setScrollLeft(offset)
            )
        )
    }

    handleScrollbar() {
        const {addSubscription} = this.props
        const element = this.getElement()
        const scroll$ = fromEvent(element, 'scroll')
        const update$ = scroll$.pipe(
            mergeWith(this.resize$),
            switchMap(() => animationFrames().pipe(
                map(() => ({
                    scrollTop: element.scrollTop,
                    scrollLeft: element.scrollLeft,
                    clientHeight: element.clientHeight,
                    clientWidth: element.clientWidth,
                    scrollHeight: element.scrollHeight,
                    scrollWidth: element.scrollWidth
                })),
                distinctUntilChanged(_.isEqual),
                takeUntil(timer(100))
            ))
        )
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
        const dragging$ = this.dragging$.pipe(
            switchMap(() => of(true).pipe(
                concatWith(
                    of(false).pipe(
                        delay(50)
                    )
                )
            )),
            distinctUntilChanged(),
        )
        addSubscription(
            update$.subscribe(
                scroll => this.update(scroll)
            ),
            scrolling$.subscribe(
                scrolling => this.setState({scrolling})
            ),
            dragging$.subscribe(
                dragging => this.setState({dragging})
            )
        )
    }

    update(scroll) {
        const {direction} = this.props
        if (['y', 'xy'].includes(direction)) {
            this.updateVertical(scroll)
        }
        if (['x', 'xy'].includes(direction)) {
            this.updateHorizontal(scroll)
        }
    }

    updateVertical({scrollTop, clientHeight, scrollHeight}) {
        const overflowTop = scrollTop
        const overflowBottom = scrollHeight - clientHeight - scrollTop
        const verticalFactor = (clientHeight - MIN_HANDLE_SIZE) / scrollHeight
        const scrollbarTop = overflowTop * verticalFactor
        const scrollbarBottom = overflowBottom * verticalFactor
        this.setState({scrollbarTop, scrollbarBottom, verticalFactor, clientHeight, scrollHeight, scrollTop})
    }

    updateHorizontal({scrollLeft, clientWidth, scrollWidth}) {
        const overflowLeft = scrollLeft
        const overflowRight = scrollWidth - clientWidth - scrollLeft
        const horizontalFactor = (clientWidth - MIN_HANDLE_SIZE) / scrollWidth
        const scrollbarLeft = overflowLeft * horizontalFactor
        const scrollbarRight = overflowRight * horizontalFactor
        this.setState({scrollbarLeft, scrollbarRight, horizontalFactor, clientWidth, scrollWidth, scrollLeft})
    }

    componentDidMount() {
        const {hideScrollbar} = this.props
        this.handleContentSize()
        this.handleHover()
        this.handleScroll()
        if (!hideScrollbar) {
            this.handleScrollbar()
        }
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
    withSubscriptions()
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
