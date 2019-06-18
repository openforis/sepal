import {Button, ButtonGroup} from 'widget/button'
import {compose} from 'compose'
import {connect} from 'store'
import {msg} from 'translate'
import {selectFrom} from 'stateUtils'
import Keybinding from 'widget/keybinding'
import OverflowDetector from 'widget/overflowDetector'
import PropTypes from 'prop-types'
import React from 'react'
import _ from 'lodash'

const {Provider, Consumer} = React.createContext()

export class Pageable extends React.Component {
    render() {
        const {items, matcher, children} = this.props
        return (
            <Keybinding keymap={{
                'Ctrl+Shift+ArrowLeft': () => this.firstPage(),
                'Ctrl+ArrowLeft': () => this.previousPage(),
                'Ctrl+ArrowRight': () => this.nextPage()
            }}>
                <PageContext
                    items={items || []}
                    matcher={matcher}>
                    {children}
                </PageContext>
            </Keybinding>
        )
    }
}

Pageable.propTypes = {
    children: PropTypes.any.isRequired,
    items: PropTypes.array.isRequired,
    matcher: PropTypes.func
}

const mapStateToProps = state => ({
    dimensions: selectFrom(state, 'dimensions') || []
})

class _PageContext extends React.Component {
    state = {}

    componentDidMount() {
        this.updateItemCount()
    }

    componentDidUpdate(prevProps) {
        if (!_.isEqual(prevProps.items, this.props.items)) {
            this.updateItemCount()
        }
        if (!_.isEqual(prevProps.matcher, this.props.matcher)) {
            this.updateItemCount()
        }
        if (!_.isEqual(prevProps.dimensions, this.props.dimensions)) {
            this.refreshOnResize()
        }
    }

    updateItemCount() {
        const {items} = this.props
        const count = items.length
        this.setState({
            pageItems: [],
            count,
            start: 0,
            stop: undefined,
            direction: 1
        })
    }

    refreshOnResize() {
        this.setState({
            pageItems: [],
            stop: undefined,
            direction: 1
        })
    }

    isFirstPage() {
        const {count, start} = this.state
        return !count || start === 0
    }

    isLastPage() {
        const {count, stop} = this.state
        return !count || stop === count
    }

    firstPage() {
        if (!this.isFirstPage()) {
            this.setState({
                pageItems: [],
                start: 0,
                stop: undefined,
                direction: 1
            })
        }
    }

    previousPage() {
        if (!this.isFirstPage()) {
            this.setState(({count, start}) => ({
                pageItems: [],
                start: undefined,
                stop: Math.min(start, count),
                direction: -1
            }))
        }
    }

    nextPage() {
        if (!this.isLastPage()) {
            this.setState(({stop}) => ({
                pageItems: [],
                start: Math.max(stop, 0),
                stop: undefined,
                direction: 1
            }))
        }
    }

    isMatching(item) {
        const {matcher} = this.props
        return !matcher || matcher(item)
    }

    next(overflow) {
        const {items} = this.props
        const {direction} = this.state

        const FILL_FIRST_PAGE = true
        const FILL_LAST_PAGE = false

        if (direction === 0) {
            return
        }

        const forwards = ({start, stop, count, pageItems}) => {
            for (;;) {
                stop = stop === undefined
                    ? start
                    : stop + 1
                if (stop > count) {
                    return {
                        stop: count,
                        direction: FILL_LAST_PAGE ? - 1 : 0
                    }
                } else if (stop === start) {
                    return {
                        stop: stop
                    }
                } else {
                    const item = items[stop - 1]
                    if (this.isMatching(item)) {
                        return {
                            stop: stop,
                            pageItems: [...pageItems, item]
                        }
                    }
                }
            }
        }

        const backwards = ({start, stop, pageItems}) => {
            for (;;) {
                start = start === undefined
                    ? stop
                    : start - 1
                if (start < 0) {
                    return {
                        start: 0,
                        direction: FILL_FIRST_PAGE ? 1 : 0
                    }
                } else if (start === stop) {
                    return {
                        start: start
                    }
                } else {
                    const item = items[start]
                    if (this.isMatching(item)) {
                        return {
                            start: start,
                            pageItems: [item, ...pageItems]
                        }
                    }
                }
            }
        }

        this.setState(({pageItems, count, start, stop, direction}) => {
            // console.log('previous state', {count, start, stop, direction})
            if (overflow) {
                if (direction === 1) {
                    return {
                        stop: stop - 1,
                        direction: 0,
                        pageItems: pageItems.slice(0, -1)
                    }
                } else {
                    return {
                        start: start + 1,
                        direction: 0,
                        pageItems: pageItems.slice(1)
                    }
                }
            } else {
                return direction === 1
                    ? forwards({pageItems, start, stop, count})
                    : backwards({pageItems, start, stop})
            }
        })
    }

    render() {
        const {pageItems, count, start, stop, direction} = this.state
        // console.log('render', {pageItems, count, start, stop, direction})
        const {children} = this.props
        const isFirstPage = this.isFirstPage()
        const isLastPage = this.isLastPage()
        const isSinglePage = isFirstPage && isLastPage
        return (
            <Provider value={{
                items: pageItems,
                count,
                start,
                stop,
                direction,
                isFirstPage,
                isLastPage,
                isSinglePage,
                firstPage: () => this.firstPage(),
                lastPage: () => this.lastPage(),
                previousPage: () => this.previousPage(),
                nextPage: () => this.nextPage(),
                next: overflow => this.next(overflow)
            }}>
                {children}
            </Provider>
        )
    }
}

export const PageContext = compose(
    _PageContext,
    connect(mapStateToProps)
)

export class PageData extends React.Component {
    ref = React.createRef()
    render() {
        const {itemKey, children} = this.props
        return (
            <Consumer>
                {({items, next}) =>
                    <OverflowDetector>
                        {isOverflown =>
                            <PageItems
                                items={items || []}
                                next={() => next(isOverflown())}
                                itemKey={itemKey}>
                                {children}
                            </PageItems>
                        }
                    </OverflowDetector>
                }
            </Consumer>
        )
    }
}

PageData.propTypes = {
    children: PropTypes.func.isRequired,
    itemKey: PropTypes.func.isRequired
}

class PageItems extends React.Component {
    render() {
        const {items} = this.props
        return items.map(
            (item, index) => this.renderItem(item, index)
        )
    }

    renderItem(item, index) {
        const {itemKey, children} = this.props
        const key = itemKey(item) || index
        return (
            <PageItem
                key={key}
                item={item}>
                {children}
            </PageItem>
        )
    }

    componentDidUpdate() {
        const {next} = this.props
        next()
    }
}

PageItems.propTypes = {
    children: PropTypes.any.isRequired,
    itemKey: PropTypes.func.isRequired,
    items: PropTypes.array.isRequired,
    next: PropTypes.func.isRequired
}

class PageItem extends React.Component {
    render() {
        const {item, children} = this.props
        return children(item)
    }

    shouldComponentUpdate(nextProps) {
        return nextProps.item !== this.props.item
    }
}

export const PageControls = props => {
    const renderDefaultControls = pageable =>
        <ButtonGroup type='horizontal-nowrap'>
            <Button
                chromeless
                size='large'
                shape='pill'
                icon='fast-backward'
                onClick={() => pageable.firstPage()}
                disabled={pageable.isFirstPage}/>
            <Button
                chromeless
                size='large'
                shape='pill'
                icon='backward'
                onClick={() => pageable.previousPage()}
                disabled={pageable.isFirstPage}/>
            <Button
                chromeless
                size='large'
                shape='pill'
                icon='forward'
                onClick={() => pageable.nextPage()}
                disabled={pageable.isLastPage}/>
        </ButtonGroup>
    const renderCustomControls = pageable =>
        <React.Fragment>
            {props.children({...pageable, renderDefaultControls: () => renderDefaultControls(pageable)})}
        </React.Fragment>

    return (
        <Consumer>
            {pageable => props.children
                ? renderCustomControls(pageable)
                : renderDefaultControls(pageable)
            }
        </Consumer>
    )
}

PageControls.propTypes = {
    children: PropTypes.func
}

export const PageInfo = props => {
    const renderDefaultInfo = ({count, start, stop}) =>
        <div>
            {msg('pagination.info', {count, start, stop})}
        </div>
    
    const renderCustomInfo = ({pageNumber, pageCount, count}) =>
        <React.Fragment>
            {props.children({pageNumber, pageCount, count})}
        </React.Fragment>

    return (
        <Consumer>
            {pageable => props.children
                ? renderCustomInfo(pageable)
                : renderDefaultInfo(pageable)
            }
        </Consumer>
    )
}

PageInfo.propTypes = {
    children: PropTypes.func
}
