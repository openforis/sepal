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
    }
    
    render() {
        const {items} = this.props
        return items
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

    renderList() {
        const {firstVisibleItem, lastVisibleItem, marginTop, marginBottom} = this.state
        return (
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

    getItemHeight() {
        const {singleItemHeight, spacedItemHeight} = this.state
        return {
            itemHeight: spacedItemHeight || singleItemHeight,
            itemSpacing: Math.max(0, spacedItemHeight - singleItemHeight)
        }
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
        return children(item)
    }
}

FastListItem.propTypes = {
    children: PropTypes.func.isRequired,
    item: PropTypes.object.isRequired
}
