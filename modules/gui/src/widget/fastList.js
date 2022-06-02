import {ElementResizeDetector} from 'widget/elementResizeDetector'
import {Subject, animationFrames, distinctUntilChanged, fromEvent, map, mergeWith, switchMap} from 'rxjs'
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
        itemHeight: null,
        firstVisibleItem: 0,
        lastVisibleItem: 0,
        marginTop: 0,
        marginBottom: 0
    }

    constructor(props) {
        super(props)
        this.setItemHeight = this.setItemHeight.bind(this)
        this.initScrollable = this.initScrollable.bind(this)
        this.renderItem = this.renderItem.bind(this)
        this.onResize = this.onResize.bind(this)
    }
    
    render() {
        const {items} = this.props
        const {itemHeight} = this.state
        return items
            ? itemHeight
                ? this.renderList()
                : this.renderItemSampler()
            : null
    }

    renderItemSampler() {
        const {items, itemKey, children} = this.props
        return items && items.length
            ? (
                <div ref={this.setItemHeight} key={itemKey(items[0])}>
                    {children(items[0])}
                </div>
            )
            : null
    }

    setItemHeight(element) {
        if (element) {
            const {height: itemHeight} = element.getBoundingClientRect()
            this.setState({itemHeight})
        }
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
        const {items} = this.props
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
                    {items.slice(firstVisibleItem, lastVisibleItem).map(this.renderItem)}
                </div>
            </div>
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
                    distinctUntilChanged()
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
        const {itemHeight} = this.state
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
    item: PropTypes.object.isRequired
}
