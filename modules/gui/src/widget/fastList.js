import {ElementResizeDetector} from 'widget/elementResizeDetector'
import {HoverDetector} from './hover'
import {Layout} from './layout'
import {Subject, animationFrames, distinctUntilChanged, fromEvent, map, mergeWith, switchMap, takeUntil, tap, timer} from 'rxjs'
import {compose} from 'compose'
import {withSubscriptions} from 'subscription'
import Keybinding from './keybinding'
import PropTypes from 'prop-types'
import React from 'react'
import _ from 'lodash'
import styles from './fastList.module.css'

const NOT_HOVERED = -1

class _FastList extends React.PureComponent {
    resize$ = new Subject()
    reset$ = new Subject()

    state = {
        singleItemHeight: null,
        spacedItemHeight: null,
        firstVisibleItem: 0,
        lastVisibleItem: 0,
        marginTop: 0,
        marginBottom: 0,
        keyboardHover: NOT_HOVERED,
        mouseHover: false
    }

    constructor(props) {
        super(props)
        this.initScrollable = this.initScrollable.bind(this)
        this.renderItem = this.renderItem.bind(this)
        this.handleArrowDown = this.handleArrowDown.bind(this)
        this.handleArrowUp = this.handleArrowUp.bind(this)
        this.handleEnter = this.handleEnter.bind(this)
        this.handleEscape = this.handleEscape.bind(this)
        this.setMouseHover = this.setMouseHover.bind(this)
    }
    
    render() {
        const {items} = this.props
        return items?.length
            ? this.renderSingleItemSampler() || this.renderSpacedItemSampler() || this.renderList()
            : null
    }

    renderSingleItemSampler() {
        const {items} = this.props
        const {singleItemHeight} = this.state
        if (items.length > 0 && !singleItemHeight) {
            return this.renderSampler(1, ({height: singleItemHeight}) => {
                this.setState({singleItemHeight})
            })
        }
    }

    renderSpacedItemSampler() {
        const {items} = this.props
        const {singleItemHeight, spacedItemHeight} = this.state
        if (items.length > 1 && !spacedItemHeight) {
            return this.renderSampler(2, ({height}) => {
                const spacedItemHeight = height - singleItemHeight
                this.setState({spacedItemHeight})
            })
        }
    }

    renderSampler(count, callback) {
        return (
            <div ref={element => element && callback(element.getBoundingClientRect())}>
                {this.renderItems(0, count)}
            </div>
        )
    }

    getKeymap() {
        const {mouseHover, keyboardHover} = this.state
        if (mouseHover) {
            return null
        }
        if (keyboardHover !== NOT_HOVERED) {
            return {
                'ArrowDown': this.handleArrowDown,
                'ArrowUp': this.handleArrowUp,
                'Enter': this.handleEnter,
                'Escape': this.handleEscape
            }
        }
        return {
            'ArrowDown': this.handleArrowDown,
            'ArrowUp': this.handleArrowUp
        }
    }

    renderList() {
        const {firstVisibleItem, lastVisibleItem, marginTop, marginBottom} = this.state
        return (
            // <HoverDetector onHover={this.setMouseHover}>
            <Keybinding keymap={this.getKeymap()}>
                <ElementResizeDetector resize$={this.resize$}>
                    <div
                        ref={this.initScrollable}
                        className={styles.container}>
                        <div className={styles.scrollable}>
                            {this.renderFiller(marginTop)}
                            {this.renderItems(firstVisibleItem, lastVisibleItem)}
                            {this.renderFiller(marginBottom)}
                        </div>
                    </div>
                </ElementResizeDetector>
            </Keybinding>
            // </HoverDetector>
        )
    }

    renderFiller(height) {
        const {itemHeight} = this.getItemHeight()
        return (
            <div
                className={styles.filler}
                style={{
                    '--height': height,
                    '--itemHeight': itemHeight
                }}
            />
        )
    }

    renderItems(firstVisibleItem, lastVisibleItem) {
        const {items, spacing} = this.props
        return (
            <Layout type='vertical' spacing={spacing}>
                {items.slice(firstVisibleItem, lastVisibleItem).map(this.renderItem)}
            </Layout>
        )
    }

    renderItem(item, index) {
        const {itemKey, itemRenderer, children} = this.props
        const {keyboardHover, mouseHover} = this.state
        return (
            <FastListItem
                item={item}
                key={itemKey(item)}
                hovered={!mouseHover && keyboardHover === index}>
                {itemRenderer || children}
            </FastListItem>
        )
    }

    initScrollable(element) {
        if (element) {
            const scroll$ = fromEvent(element, 'scroll')
            const {addSubscription} = this.props
            const update$ = scroll$.pipe(
                mergeWith(this.resize$),
                switchMap(() => animationFrames().pipe(
                    map(() => element.scrollTop),
                    distinctUntilChanged(),
                    takeUntil(timer(100))
                ))
            )
            addSubscription(
                update$.subscribe(
                    scrollTop => this.update(scrollTop, element.clientHeight)
                ),
                this.reset$.subscribe(
                    () => this.reset(element)
                )
            )
            this.reset(element)
        }
    }

    reset(element) {
        if (element) {
            element.scrollTop = 0
            this.update(0, element.clientHeight)
            this.setState({keyboardHover: NOT_HOVERED})
        }
    }

    getItemHeight() {
        const {singleItemHeight, spacedItemHeight} = this.state
        return {
            itemHeight: spacedItemHeight || singleItemHeight,
            itemSpacing: Math.max(0, spacedItemHeight - singleItemHeight)
        }
    }

    handleArrowDown() {
        const {items} = this.props
        this.setState(({keyboardHover}) => ({keyboardHover: Math.min(keyboardHover + 1, items.length - 1)}))
    }

    handleArrowUp() {
        this.setState(({keyboardHover}) => ({keyboardHover: Math.max(keyboardHover - 1, NOT_HOVERED)}))
    }

    handleEnter() {
        const {items, onEnter} = this.props
        const {keyboardHover} = this.state
        onEnter && onEnter(items[keyboardHover])
    }

    handleEscape() {
        this.setState({keyboardHover: NOT_HOVERED})
    }

    setMouseHover(mouseHover) {
        this.setState({mouseHover})
    }

    update(scrollTop, clientHeight) {
        const {items, overflow} = this.props
        const {itemHeight, itemSpacing} = this.getItemHeight()
        const firstVisibleItem = Math.max(0, Math.ceil(scrollTop / itemHeight) - overflow)
        const lastVisibleItem = Math.min(items.length, Math.floor((scrollTop + clientHeight + itemSpacing) / itemHeight) + overflow)
        const marginTop = firstVisibleItem * itemHeight
        const marginBottom = (items.length - lastVisibleItem) * itemHeight
        this.setState({firstVisibleItem, lastVisibleItem, marginTop, marginBottom})
    }

    componentDidUpdate({items: prevItems}) {
        const {items} = this.props
        if (!_.isEqual(prevItems, items)) {
            this.reset$.next()
        }
    }
}

export const FastList = compose(
    _FastList,
    withSubscriptions()
)

FastList.propTypes = {
    itemKey: PropTypes.func.isRequired,
    items: PropTypes.array.isRequired,
    children: PropTypes.func,
    itemRenderer: PropTypes.func,
    overflow: PropTypes.number,
    spacing: PropTypes.any
}

FastList.defaultProps = {
    overflow: 10,
    spacing: 'none'
}

class FastListItem extends React.PureComponent {
    render() {
        const {item, hovered, children} = this.props
        // return children(item, hovered)
        return (
            <div ref={hovered ? this.hovered : null}>
                {children(item, hovered)}
            </div>
        )
    }

    hovered(element) {
        if (element) {
            element.scrollIntoViewIfNeeded
                ? element.scrollIntoViewIfNeeded()
                : element.scrollIntoView()
        }
    }
}

FastListItem.propTypes = {
    children: PropTypes.func.isRequired,
    item: PropTypes.object.isRequired,
    hovered: PropTypes.any
}
