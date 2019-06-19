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

const mapStateToProps = state => ({
    dimensions: selectFrom(state, 'dimensions') || []
})

class _Pageable extends React.Component {
    state = {}

    render() {
        const {pageItems, count, start, stop, direction} = this.state
        const {children} = this.props
        const isFirstPage = this.isFirstPage()
        const isLastPage = this.isLastPage()
        const isSinglePage = isFirstPage && isLastPage
        return (
            <Keybinding keymap={{
                'Ctrl+Shift+ArrowLeft': () => this.firstPage(),
                'Ctrl+ArrowLeft': () => this.previousPage(),
                'Ctrl+ArrowRight': () => this.nextPage()
            }}>
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
            </Keybinding>
        )
    }

    componentDidMount() {
        this.reset()
    }

    componentDidUpdate(prevProps) {
        if (this.needsReset(prevProps)) {
            this.reset()
        }
        if (this.needsRefresh(prevProps)) {
            this.refresh()
        }
    }

    needsReset(prevProps) {
        return !_.isEqual(prevProps.items, this.props.items)
            || !_.isEqual(prevProps.matcher, this.props.matcher)
    }

    needsRefresh(prevProps) {
        return !_.isEqual(prevProps.dimensions, this.props.dimensions)
    }

    reset() {
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

    refresh() {
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
            this.setState(({start}) => ({
                pageItems: [],
                start: undefined,
                stop: start,
                direction: -1
            }))
        }
    }

    nextPage() {
        if (!this.isLastPage()) {
            this.setState(({stop}) => ({
                pageItems: [],
                start: stop,
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
        const {items, fillFirstPage, fillLastPage} = this.props
        const {direction} = this.state

        if (direction === 0) {
            return
        }
        
        this.setState(({pageItems, count, start, stop, direction}) => {
            return direction === 1
                ? nextForwards({pageItems, overflow, start, stop, count})
                : nextBackwards({pageItems, overflow, start, stop})
        })

        const nextForwards = ({pageItems, overflow, start, stop, count}) => {
            if (overflow) {
                return {
                    stop: stop - 1,
                    direction: 0,
                    pageItems: pageItems.slice(0, -1)
                }
            }
            for (;;) {
                stop = stop === undefined
                    ? start
                    : stop + 1
                if (stop > count) {
                    return {
                        stop: count,
                        direction: fillLastPage ? - 1 : 0
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

        const nextBackwards = ({pageItems, overflow, start, stop}) => {
            if (overflow) {
                return {
                    start: start + 1,
                    direction: 0,
                    pageItems: pageItems.slice(1)
                }
            }
            for (;;) {
                start = start === undefined
                    ? stop
                    : start - 1
                if (start < 0) {
                    return {
                        start: 0,
                        direction: fillFirstPage ? 1 : 0
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
    }
}

export const Pageable = compose(
    _Pageable,
    connect(mapStateToProps)
)

Pageable.propTypes = {
    children: PropTypes.any.isRequired,
    items: PropTypes.array.isRequired,
    fillFirstPage: PropTypes.bool,
    fillLastPage: PropTypes.bool,
    matcher: PropTypes.func
}

Pageable.defaultProps = {
    fillFirstPage: true,
    fillLastPage: false,
}

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
        
    const renderCustomInfo = ({count, start, stop}) =>
        <React.Fragment>
            {props.children({count, start, stop})}
        </React.Fragment>

    const pageinfo = ({count, start, stop}) => ({
        count,
        start: start + 1,
        stop
    })

    return (
        <Consumer>
            {pageable => props.children
                ? renderCustomInfo(pageinfo(pageable))
                : renderDefaultInfo(pageinfo(pageable))
            }
        </Consumer>
    )
}

PageInfo.propTypes = {
    children: PropTypes.func
}
