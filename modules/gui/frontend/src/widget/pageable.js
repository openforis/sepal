import {Button, ButtonGroup} from 'widget/button'
import {msg} from 'translate'
import PropTypes from 'prop-types'
import React from 'react'
import _ from 'lodash'

const {Provider, Consumer} = React.createContext()

export class Pageable extends React.Component {
    state = {
        itemCount: null,
        pageCount: null,
        pageNumber: 1
    }

    componentDidMount() {
        this.update()
    }

    componentDidUpdate(prevProps) {
        if (!_.isEqual(prevProps.items, this.props.items) || !_.isEqual(prevProps.limit, this.props.limit)) {
            this.update()
        }
    }

    update() {
        const {items, limit} = this.props
        const itemCount = items.length
        const pageCount = Math.max(Math.ceil(itemCount / limit), 1)
        this.setState({
            pageCount,
            itemCount,
            pageNumber: 1
        })
    }

    firstPage() {
        this.setState({
            pageNumber: 1
        })
    }

    lastPage() {
        this.setState(prevState => ({
            ...prevState,
            pageNumber: prevState.pageCount
        }))
    }

    previousPage() {
        this.setState(prevState => ({
            ...prevState,
            pageNumber: Math.max(prevState.pageNumber - 1, 1)
        }))
    }

    nextPage() {
        this.setState(prevState => ({
            ...prevState,
            pageNumber: Math.min(prevState.pageNumber + 1, prevState.pageCount)
        }))
    }

    getPageItems() {
        const {items, limit} = this.props
        const {pageNumber} = this.state
        return items.slice((pageNumber - 1) * limit, pageNumber * limit)
    }

    render() {
        const {itemCount, pageCount, pageNumber} = this.state
        const {children} = this.props
        const isFirstPage = !itemCount || pageNumber === 1
        const isLastPage = !itemCount || pageNumber === pageCount
        const isSinglePage = isFirstPage && isLastPage
        return (
            <Provider value={{
                itemCount,
                pageCount,
                pageNumber,
                isFirstPage,
                isLastPage,
                isSinglePage,
                pageItems: this.getPageItems(),
                firstPage: () => this.firstPage(),
                lastPage: () => this.lastPage(),
                previousPage: () => this.previousPage(),
                nextPage: () => this.nextPage()
            }}>
                {children}
            </Provider>
        )
    }
}

Pageable.propTypes = {
    children: PropTypes.any.isRequired,
    items: PropTypes.array.isRequired,
    limit: PropTypes.number.isRequired
}

export const PageData = props =>
    <Consumer>
        {({pageItems}) =>
            <React.Fragment>
                {pageItems.map((item, index) => props.children(item, index))}
            </React.Fragment>
        }
    </Consumer>

PageData.propTypes = {
    children: PropTypes.func.isRequired
}

export const PageControls = props => {
    const renderDefaultControls = pageable =>
        <ButtonGroup type='horizontal-tight'>
            <Button
                chromeless
                size='large'
                shape='circle'
                icon='fast-backward'
                onClick={() => pageable.firstPage()}
                disabled={pageable.isFirstPage}/>
            <Button
                chromeless
                size='large'
                shape='circle'
                icon='backward'
                onClick={() => pageable.previousPage()}
                disabled={pageable.isFirstPage}/>
            <Button chromeless size='large'>
                <span>{pageable.pageNumber}</span>
            </Button>
            <Button
                chromeless
                size='large'
                shape='circle'
                icon='forward'
                onClick={() => pageable.nextPage()}
                disabled={pageable.isLastPage}/>
            <Button
                chromeless
                size='large'
                shape='circle'
                icon='fast-forward'
                onClick={() => pageable.lastPage()}
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
    const renderDefaultInfo = ({pageNumber, pageCount, itemCount}) =>
        <div>
            {msg('pagination.info', {pageNumber, pageCount, itemCount})}
        </div>
    
    const renderCustomInfo = ({pageNumber, pageCount, itemCount}) =>
        <React.Fragment>
            {props.children({pageNumber, pageCount, itemCount})}
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
