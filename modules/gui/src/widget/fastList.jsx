import _ from 'lodash'
import PropTypes from 'prop-types'
import React from 'react'
import {debounceTime, Subject} from 'rxjs'

import {compose} from '~/compose'
import {withSubscriptions} from '~/subscription'

import styles from './fastList.module.css'
import {Keybinding} from './keybinding'
import {Layout} from './layout'
import {Scrollable, withScrollable} from './scrollable'

const NOT_HOVERED = -1

export class FastList extends React.Component {
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

class _FastListContent extends React.PureComponent {
    update$ = new Subject()

    state = {
        singleItemHeight: null,
        spacedItemHeight: null,
        firstVisibleItem: 0,
        lastVisibleItem: 0,
        firstRenderedItem: 0,
        lastRenderedItem: 0,
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
        const {firstRenderedItem, lastRenderedItem, marginTop, marginBottom} = this.state
        return (
            <Keybinding keymap={this.getKeymap()}>
                <div ref={this.initScrollable}>
                    {this.renderFiller(marginTop)}
                    {this.renderItems(firstRenderedItem, lastRenderedItem)}
                    {this.renderFiller(marginBottom)}
                </div>
            </Keybinding>
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
        const {keyboardHover, mouseHover} = this.state
        return (
            <FastListItem
                item={item}
                key={itemKey(item)}
                hovered={!mouseHover && (keyboardHover - firstRenderedItem) === index}>
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

    isVisible(item) {
        const {firstVisibleItem, lastVisibleItem} = this.state
        return item >= firstVisibleItem && item <= lastVisibleItem
    }

    handleArrowDown() {
        const {items} = this.props
        const {firstVisibleItem} = this.state
        this.setState(({keyboardHover}) => ({
            keyboardHover: this.isVisible(keyboardHover)
                ? Math.min(keyboardHover + 1, items.length - 1)
                : firstVisibleItem
        }))
    }

    handleArrowUp() {
        const {lastVisibleItem} = this.state
        this.setState(({keyboardHover}) => ({
            keyboardHover: this.isVisible(keyboardHover)
                ? Math.max(keyboardHover - 1, NOT_HOVERED)
                : lastVisibleItem - 1
        }))
    }

    handleEnter() {
        const {items, onEnter} = this.props
        const {keyboardHover} = this.state
        onEnter && onEnter(items[keyboardHover])
    }

    handleEscape() {
        this.setState({keyboardHover: NOT_HOVERED})
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
        const {items, scrollable: {scrollTop, clientHeight, dragging}} = this.props
        if (!_.isEqual(prevItems, items)) {
            this.reset()
        } else if (scrollTop !== prevScrollTop || clientHeight !== prevClientHeight || dragging !== prevDragging) {
            this.update$.next()
        }
    }
}

const FastListContent = compose(
    _FastListContent,
    withScrollable(),
    withSubscriptions()
)

class FastListItem extends React.PureComponent {
    render() {
        const {item, hovered, children} = this.props
        return (
            <div ref={hovered ? this.hovered : null}>
                {children(item, hovered)}
            </div>
        )
    }

    hovered(element) {
        if (element) {
            element.scrollIntoViewIfNeeded
                ? element.scrollIntoViewIfNeeded(false)
                : element.scrollIntoView()
        }
    }
}

FastListItem.propTypes = {
    children: PropTypes.func.isRequired,
    item: PropTypes.object.isRequired,
    hovered: PropTypes.any
}
