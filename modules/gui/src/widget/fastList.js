import {ElementResizeDetector} from 'widget/elementResizeDetector'
import {Layout} from './layout'
import {Subject, animationFrames, distinctUntilChanged, fromEvent, map, mergeWith, switchMap, takeUntil, throttleTime, timer} from 'rxjs'
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
        itemHeight: 0,
        itemSpacing: 0,
        spacedItemHeight: 0,
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
            ? this.renderItemHeightSampler() || this.renderItemSpacingSampler() || this.renderList()
            : null
    }

    renderItemHeightSampler() {
        const {items} = this.props
        const {itemHeight} = this.state
        if (items.length > 0 && !itemHeight) {
            return this.renderSampler(1, ({height: itemHeight}) => {
                this.setState({itemHeight})
            })
        }
    }

    renderItemSpacingSampler() {
        const {items} = this.props
        const {itemHeight, itemSpacing} = this.state
        if (items.length > 1 && !itemSpacing) {
            return this.renderSampler(2, ({height}) => {
                const itemSpacing = height - 2 * itemHeight
                const spacedItemHeight = itemHeight + itemSpacing
                this.setState({itemSpacing, spacedItemHeight})
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

    renderList() {
        const {firstVisibleItem, lastVisibleItem, marginTop, marginBottom} = this.state
        return (
            <ElementResizeDetector onResize={this.onResize}>
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
        )
    }

    renderFiller(height) {
        const spacedItemHeight = this.getSpacedItemHeight()
        return (
            <div
                className={styles.filler}
                style={{
                    '--height': height,
                    '--itemHeight': spacedItemHeight
                }}/>
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

    renderItem(item) {
        const {itemKey, children} = this.props
        return (
            <FastListItem item={item} key={itemKey(item)}>
                {children}
            </FastListItem>
        )
    }

    getSpacedItemHeight() {
        const {itemHeight, spacedItemHeight} = this.state
        return spacedItemHeight || itemHeight
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

    onResize() {
        this.resize$.next(true)
    }

    reset(element) {
        if (element) {
            element.scrollTop = 0
            this.update(0, element.clientHeight)
        }
    }

    update(scrollTop, clientHeight) {
        const {itemSpacing} = this.state
        const spacedItemHeight = this.getSpacedItemHeight()
        const {items, overflow} = this.props
        const firstVisibleItem = Math.max(0, Math.ceil(scrollTop / spacedItemHeight) - overflow)
        const lastVisibleItem = Math.min(items.length, Math.floor((scrollTop + clientHeight + itemSpacing) / spacedItemHeight) + overflow)
        const marginTop = firstVisibleItem * spacedItemHeight
        const marginBottom = (items.length - lastVisibleItem) * spacedItemHeight
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
    overflow: PropTypes.number,
    spacing: PropTypes.any
}

FastList.defaultProps = {
    overflow: 10,
    spacing: 'none'
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
    item: PropTypes.object.isRequired
}
