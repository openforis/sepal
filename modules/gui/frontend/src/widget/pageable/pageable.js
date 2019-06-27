import {PageableControls} from './pageableControls'
import {PageableData} from './pageableData'
import {PageableInfo} from './pageableInfo'
import {Provider} from './pageableContext'
import {compose} from 'compose'
import {connect} from 'store'
import {selectFrom} from 'stateUtils'
import Keybinding from 'widget/keybinding'
import PropTypes from 'prop-types'
import React from 'react'
import _ from 'lodash'

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

    isFirstPage() {
        const {count, start} = this.state
        return !count || start === 0
    }

    isLastPage() {
        const {count, stop} = this.state
        return !count || stop === count
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

Pageable.Data = PageableData
Pageable.Controls = PageableControls
Pageable.Info = PageableInfo
