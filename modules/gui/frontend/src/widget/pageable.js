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
    state = {
        count: undefined,
        start: 0,
        stop: undefined,
        direction: 1
    }

    componentDidMount() {
        this.updateItemCount()
    }

    componentDidUpdate(prevProps) {
        if (!_.isEqual(prevProps.items, this.props.items)) {
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
            count,
            start: 0,
            stop: undefined,
            direction: 1
        })
    }

    refreshOnResize() {
        this.setState({
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
                start: 0,
                stop: undefined,
                direction: 1
            })
        }
    }

    previousPage() {
        if (!this.isFirstPage()) {
            this.setState(({count, start}) => ({
                start: undefined,
                stop: Math.min(start, count),
                direction: -1
            }))
        }
    }

    nextPage() {
        if (!this.isLastPage()) {
            this.setState(({stop}) => ({
                start: Math.max(stop, 0),
                stop: undefined,
                direction: 1
            }))
        }
    }

    next(overflow) {
        const {direction} = this.state
        if (overflow === null || direction === 0) {
            return
        }

        this.setState(({count, start, stop, direction}) => {
            const offset = overflow ? - 1 : 1
        
            const isEdge = ({start, stop}) => (direction === -1 && start < 0) || (direction === 1 && stop > count)
        
            const nextState = ({start, stop}) => ({
                start: Math.max(start, 0),
                stop: Math.min(stop, count),
                direction: overflow
                    ? 0
                    : isEdge({start, stop})
                        ? direction === -1
                            ? direction = 1
                            : 0
                        : direction
            })

            const nextValue = (thisValue, otherValue) =>
                thisValue === undefined
                    ? otherValue
                    : thisValue + offset * direction
    
            return direction === 1
                ? nextState({
                    start,
                    stop: nextValue(stop, start)
                })
                : nextState({
                    start: nextValue(start, stop),
                    stop
                })
        })
    }

    render() {
        const {count, start, stop, direction} = this.state
        const {items, children} = this.props
        const isFirstPage = this.isFirstPage()
        const isLastPage = this.isLastPage()
        const isSinglePage = isFirstPage && isLastPage
        return (
            <Keybinding keymap={{
                'Shift+ArrowLeft': () => this.firstPage(),
                'ArrowLeft': () => this.previousPage(),
                'ArrowRight': () => this.nextPage()
            }}>
                <Provider value={{
                    count,
                    isFirstPage,
                    isLastPage,
                    isSinglePage,
                    items,
                    start,
                    stop,
                    direction,
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
}

export const Pageable = compose(
    _Pageable,
    connect(mapStateToProps)
)

Pageable.propTypes = {
    children: PropTypes.any.isRequired,
    items: PropTypes.array.isRequired
}

export class PageData extends React.Component {
    ref = React.createRef()
    render() {
        const {children} = this.props
        return (
            <OverflowDetector>
                {isOverflown =>
                    <Consumer>
                        {({items, start, stop, direction, next}) =>
                            <PageItems
                                items={items}
                                start={start}
                                stop={stop}
                                direction={direction}
                                next={next}
                                isOverflown={isOverflown}
                            >
                                {children}
                            </PageItems>
                        }
                    </Consumer>
                }
            </OverflowDetector>
        )
    }
}

PageData.propTypes = {
    children: PropTypes.func.isRequired
}

class PageItems extends React.Component {
    render() {
        const {start, stop} = this.props
        return start !== undefined && stop !== undefined
            ? this.renderPage()
            : null
    }

    renderPage() {
        const {items, start, stop, children} = this.props
        return items.slice(start, stop).map((item, index) => children(item, index))
    }

    componentDidUpdate() {
        const {next, isOverflown} = this.props
        next(isOverflown())
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
