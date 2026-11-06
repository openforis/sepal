import _ from 'lodash'
import PropTypes from 'prop-types'
import React from 'react'
import {debounceTime, Subject} from 'rxjs'

import {asFunctionalComponent} from '~/classComponent'
import {compose} from '~/compose'
import {withSubscriptions} from '~/subscription'

import styles from './fastList.module.css'
import {Keybinding} from './keybinding'
import {Layout} from './layout'
import {Scrollable, withScrollable} from './scrollable'

const NOT_HOVERED = -1

class _FastList extends React.Component {
    constructor(props) {
        super(props)
        this.renderContent = this.renderContent.bind(this)
    }

    render() {
        return (
            <Scrollable
                direction='y'
                noKeyboard
            >
                {this.renderContent()}
            </Scrollable>
        )
    }

    renderContent() {
        const {...props} = this.props
        return (
            <FastListContent
                {...props}
            />
        )
    }
}

export const FastList = compose(
    _FastList,
    asFunctionalComponent({
        overflow: 10,
        spacing: 'none'
    })
)

FastList.propTypes = {
    itemKey: PropTypes.func.isRequired,
    items: PropTypes.array.isRequired,
    children: PropTypes.func,
    itemRenderer: PropTypes.func,
    overflow: PropTypes.number,
    spacing: PropTypes.any
}

class _FastListContent extends React.PureComponent {
    update$ = new Subject()
    mouseHoverItem = null

    state = {
        singleItemHeight: null,
        spacedItemHeight: null,
        firstVisibleItem: 0,
        lastVisibleItem: 0,
        firstRenderedItem: 0,
        lastRenderedItem: 0,
        marginTop: 0,
        marginBottom: 0,
        keyboardHover: NOT_HOVERED
    }

    constructor(props) {
        super(props)
        this.initScrollable = this.initScrollable.bind(this)
        this.renderItem = this.renderItem.bind(this)
        this.handleArrowDown = this.handleArrowDown.bind(this)
        this.handleArrowUp = this.handleArrowUp.bind(this)
        this.handlePageDown = this.handlePageDown.bind(this)
        this.handlePageUp = this.handlePageUp.bind(this)
        this.handleHome = this.handleHome.bind(this)
        this.handleEnd = this.handleEnd.bind(this)
        this.handleEnter = this.handleEnter.bind(this)
        this.handleMouseActivity = this.handleMouseActivity.bind(this)
        this.handleItemMouseEnter = this.handleItemMouseEnter.bind(this)
        this.handleItemMouseLeave = this.handleItemMouseLeave.bind(this)
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
        const {keyboardHover} = this.state
        const navigation = {
            'ArrowDown': this.handleArrowDown,
            'ArrowUp': this.handleArrowUp,
            'PageDown': this.handlePageDown,
            'PageUp': this.handlePageUp,
            'Home': this.handleHome,
            'End': this.handleEnd
        }
        return keyboardHover !== NOT_HOVERED
            ? {...navigation, 'Enter': this.handleEnter}
            : navigation
    }

    renderList() {
        const {firstRenderedItem, lastRenderedItem, marginTop, marginBottom} = this.state
        return (
            <Keybinding keymap={this.getKeymap()}>
                <div
                    ref={this.initScrollable}
                    className={styles.list}>
                    {this.renderFiller(marginTop)}
                    {this.renderItems(firstRenderedItem, lastRenderedItem)}
                    {this.renderFiller(marginBottom)}
                    {this.renderMouseShield()}
                </div>
            </Keybinding>
        )
    }

    // During keyboard navigation it keeps the mouse from the items: no hover, no tooltips, also for items scrolled under
    // a resting cursor. It goes on any use of the mouse over it, as a click without moving would otherwise be lost.
    renderMouseShield() {
        const {keyboardHover} = this.state
        return keyboardHover === NOT_HOVERED
            ? null
            : (
                <div
                    className={styles.mouseShield}
                    onMouseMove={this.handleMouseActivity}
                    onMouseDown={this.handleMouseActivity}
                />
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

    renderItems(firstRenderedItem, lastRenderedItem) {
        const {items, spacing} = this.props
        return (
            <Layout
                type='vertical'
                spacing={spacing}>
                {items.slice(firstRenderedItem, lastRenderedItem).map((item, index) => this.renderItem(item, index, firstRenderedItem))}
            </Layout>
        )
    }

    renderItem(item, index, firstRenderedItem) {
        const {itemKey, itemRenderer, children} = this.props
        const {keyboardHover} = this.state
        return (
            <FastListItem
                item={item}
                key={itemKey(item)}
                hovered={(keyboardHover - firstRenderedItem) === index}
                onMouseEnter={this.handleItemMouseEnter}
                onMouseLeave={this.handleItemMouseLeave}>
                {itemRenderer || children}
            </FastListItem>
        )
    }

    initScrollable(element) {
        if (element) {
            this.reset()
        }
    }

    reset() {
        const {scrollable} = this.props
        scrollable.setScrollTop(0)
        this.update$.next()
        this.setState({keyboardHover: NOT_HOVERED})
    }

    getItemHeight() {
        const {singleItemHeight, spacedItemHeight} = this.state
        return {
            itemHeight: spacedItemHeight || singleItemHeight,
            itemSpacing: Math.max(0, spacedItemHeight - singleItemHeight)
        }
    }

    handleArrowDown() {
        this.moveKeyboardHover(start => start + 1)
    }

    handleArrowUp() {
        this.moveKeyboardHover(start => Math.max(start - 1, 0))
    }

    handlePageDown() {
        this.moveKeyboardHover(start => start + this.getPageSize())
    }

    handlePageUp() {
        this.moveKeyboardHover(start => Math.max(start - this.getPageSize(), 0))
    }

    handleHome() {
        this.moveKeyboardHover(() => 0)
    }

    handleEnd() {
        const {items} = this.props
        this.moveKeyboardHover(() => items.length - 1)
    }

    moveKeyboardHover(getTarget) {
        const {items} = this.props
        this.setState(({keyboardHover}) => ({
            keyboardHover: Math.min(getTarget(this.getNavigationStart(keyboardHover)), items.length - 1)
        }), this.scrollToKeyboardHover)
    }

    // One less than the items in view, so the item paged from stays in view.
    getPageSize() {
        const {scrollable: {clientHeight}} = this.props
        const {itemHeight, itemSpacing} = this.getItemHeight()
        return Math.max(1, Math.floor((clientHeight + itemSpacing) / itemHeight) - 1)
    }

    getNavigationStart(keyboardHover) {
        return keyboardHover === NOT_HOVERED
            ? this.getMouseHoverIndex()
            : keyboardHover
    }

    getMouseHoverIndex() {
        const {items, itemKey} = this.props
        return this.mouseHoverItem
            ? items.findIndex(item => itemKey(item) === itemKey(this.mouseHoverItem))
            : NOT_HOVERED
    }

    // Calculated rather than scrolled to from the element, as the item might be outside the rendered ones.
    scrollToKeyboardHover() {
        const {scrollable: {scrollTop, clientHeight, setScrollTop}} = this.props
        const {keyboardHover} = this.state
        if (keyboardHover !== NOT_HOVERED) {
            const {itemHeight, itemSpacing} = this.getItemHeight()
            const itemTop = keyboardHover * itemHeight
            const itemBottom = itemTop + itemHeight - itemSpacing
            setScrollTop(Math.min(itemTop, Math.max(scrollTop, itemBottom - clientHeight)))
        }
    }

    handleEnter() {
        const {items, onEnter} = this.props
        const {keyboardHover} = this.state
        onEnter && onEnter(items[keyboardHover])
    }

    handleMouseActivity() {
        this.setState({keyboardHover: NOT_HOVERED})
    }

    handleItemMouseEnter(item) {
        this.mouseHoverItem = item
    }

    handleItemMouseLeave() {
        this.mouseHoverItem = null
    }

    update() {
        const {items, overflow, scrollable: {scrollTop, clientHeight}} = this.props
        const {itemHeight, itemSpacing} = this.getItemHeight()
        const firstVisibleItem = Math.max(0, Math.ceil(scrollTop / itemHeight))
        const lastVisibleItem = Math.min(items.length, Math.floor((scrollTop + clientHeight + itemSpacing) / itemHeight))
        const firstRenderedItem = Math.max(0, firstVisibleItem - overflow)
        const lastRenderedItem = Math.min(items.length, lastVisibleItem + overflow)
        const marginTop = firstRenderedItem * itemHeight
        const marginBottom = (items.length - lastRenderedItem) * itemHeight
        this.setState({firstVisibleItem, lastVisibleItem, firstRenderedItem, lastRenderedItem, marginTop, marginBottom})
    }

    componentDidMount() {
        const {addSubscription} = this.props
        addSubscription(
            this.update$.pipe(
                debounceTime(10)
            ).subscribe(
                () => {
                    const {scrollable: {dragging}} = this.props
                    if (!dragging) {
                        this.update()
                    }
                }
            )
        )
    }

    componentDidUpdate({items: prevItems, scrollable: {scrollTop: prevScrollTop, clientHeight: prevClientHeight, dragging: prevDragging}}) {
        const {scrollable: {scrollTop, clientHeight, dragging}} = this.props
        if (this.isDifferentItems(prevItems)) {
            this.reset()
        } else if (scrollTop !== prevScrollTop || clientHeight !== prevClientHeight || dragging !== prevDragging) {
            this.update$.next()
        }
    }

    // Updates of the same items, such as the progress of a running task, leave the keyboard position and scroll alone.
    isDifferentItems(prevItems) {
        const {items, itemKey} = this.props
        return prevItems !== items && !_.isEqual(_.map(prevItems, itemKey), _.map(items, itemKey))
    }
}

const FastListContent = compose(
    _FastListContent,
    withScrollable(),
    withSubscriptions()
)

class FastListItem extends React.PureComponent {
    render() {
        const {item, hovered, children, onMouseEnter, onMouseLeave} = this.props
        return (
            <div
                onMouseEnter={() => onMouseEnter(item)}
                onMouseLeave={onMouseLeave}>
                {children(item, hovered)}
            </div>
        )
    }
}

FastListItem.propTypes = {
    children: PropTypes.func.isRequired,
    item: PropTypes.object.isRequired,
    onMouseEnter: PropTypes.func.isRequired,
    onMouseLeave: PropTypes.func.isRequired,
    hovered: PropTypes.any
}
