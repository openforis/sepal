import PropTypes from 'prop-types'
import React from 'react'
import _ from 'lodash'

const {Provider, Consumer} = React.createContext()

export class Data extends React.Component {
    state = {
        page: 1,
        pages: null
    }

    // componentDidUpdate() {
    //     const {items, limit} = this.props
    //     console.log({items, limit})
    //     this.setState(prevState => ({
    //         ...prevState,
    //         pages: Math.ceil(items.length / limit)
    //     }))
    // }

    prevPage() {
        this.setState(prevState => ({
            ...prevState,
            page: Math.max(prevState.page - 1, 1)
        }))
    }

    nextPage() {
        this.setState(prevState => ({
            ...prevState,
            page: Math.min(prevState.page + 1, 1000000)
        }))
    }

    render() {
        const {items, limit} = this.props
        const {page} = this.state
        const pageItems = items.slice((page - 1) * limit, page * limit)
        return (
            <Provider value={this}>
                <React.Fragment>
                    {pageItems.map(item => this.props.children(item))}
                </React.Fragment>
            </Provider>
        )
    }
}

Data.propTypes = {
    children: PropTypes.func.isRequired,
    items: PropTypes.array.isRequired,
    limit: PropTypes.number.isRequired
}

export const Controls = () =>
    <Consumer>
        {controls =>
            <div>
                <button onClick={() => controls.prevPage()}>Previous page</button>
                <button onClick={() => controls.nextPage()}>Next page</button>
            </div>
        }
    </Consumer>
