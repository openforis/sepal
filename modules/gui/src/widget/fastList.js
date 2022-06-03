import {ElementResizeDetector} from 'widget/elementResizeDetector'
import {Layout} from './layout'
import {Subject, animationFrames, distinctUntilChanged, fromEvent, map, mergeWith, switchMap, takeUntil, timer} from 'rxjs'
import {compose} from 'compose'
import PropTypes from 'prop-types'
import React from 'react'
import _ from 'lodash'
import styles from './fastList.module.css'
import withSubscriptions from 'subscription'

class _FastList extends React.PureComponent {
    resize$ = new Subject()
    reset$ = new Subject()

    state = {
        singleItemHeight: null,
        spacedItemHeight: null,
        firstVisibleItem: 0,
        lastVisibleItem: 0,
        marginTop: 0,
        marginBottom: 0
    }

    constructor(props) {
        super(props)
        this.initScrollable = this.initScrollable.bind(this)
        this.renderItem = this.renderItem.bind(this)
        this.onResize = this.onResize.bind(this)
    }
    
    render() {
        const {items} = this.props
        return items
            ? this.renderSingleItemSampler() || this.renderSpacedItemSampler() || this.renderList()
            : null
    }

    renderSingleItemSampler() {
        const {singleItemHeight} = this.state
        if (!singleItemHeight) {
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
        const {items} = this.props
        return items && items.length
            ? (
                <div ref={element => element && callback(element.getBoundingClientRect())}>
                    {this.renderItemsRange(0, count)}
                </div>
            )
            : null
    }

    onResize() {
        this.resize$.next(true)
    }

    renderList() {
        return (
            <ElementResizeDetector onResize={this.onResize}>
                {this.renderItems()}
            </ElementResizeDetector>
        )
    }

    renderItems() {
        const {firstVisibleItem, lastVisibleItem, marginTop, marginBottom} = this.state
        return (
            <div
                className={styles.container}
                ref={this.initScrollable}>
                <div
                    className={styles.scrollable}
                    style={{
                        '--margin-top': marginTop,
                        '--margin-bottom': marginBottom,
                    }}>
                    {this.renderItemsRange(firstVisibleItem, lastVisibleItem)}
                </div>
            </div>
        )
    }

    renderItemsRange(firstVisibleItem, lastVisibleItem) {
        const {items, spacing} = this.props
        return (
            <Layout type='vertical' spacing={spacing}>
                {items.slice(firstVisibleItem, lastVisibleItem).map(this.renderItem)}
            </Layout>
        )
    }

    renderItem(item) {
        const {itemKey, children} = this.props
        return (
            <FastListItem item={item} key={itemKey(item)}>
                {children}
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
        }
    }

    update(scrollTop, clientHeight) {
        const {items, overflow} = this.props
        const {singleItemHeight, spacedItemHeight} = this.state
        const itemHeight = spacedItemHeight || singleItemHeight
        const firstVisibleItem = Math.max(0, Math.ceil(scrollTop / itemHeight) - overflow)
        const lastVisibleItem = Math.min(items.length, Math.floor((scrollTop + clientHeight) / itemHeight) + overflow)
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
    children: PropTypes.func.isRequired,
    itemKey: PropTypes.func.isRequired,
    items: PropTypes.array.isRequired,
    overflow: PropTypes.number
}

FastList.defaultProps = {
    spacing: 'none',
    overflow: 10
}

class FastListItem extends React.PureComponent {
    render() {
        const {item, children} = this.props
        return (
            <div>
                {children(item)}
            </div>
        )
    }
}

FastListItem.propTypes = {
    children: PropTypes.func.isRequired,
    item: PropTypes.object.isRequired,
    overflow: PropTypes.number,
    spacing: PropTypes.any
}
