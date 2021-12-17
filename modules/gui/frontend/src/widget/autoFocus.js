import {compose} from 'compose'
import {connect} from 'store'
import PropTypes from 'prop-types'
import React from 'react'

class AutoFocus extends React.Component {
    state = {
        completed: false
    }

    constructor(props) {
        super(props)
        props.onEnable(() => this.reset())
    }

    render() {
        const {children} = this.props
        return children
    }

    componentDidMount() {
        const {focusEnabled} = this.props
        if (focusEnabled) {
            this.update()
        } else {
            this.completed()
        }
    }

    componentDidUpdate() {
        this.update()
    }

    update() {
        const {element, focusEnabled} = this.props
        const {completed} = this.state
        if (focusEnabled && !completed) {
            element && element.focus()
            if (document.activeElement === element) {
                this.completed()
            }
        }
    }

    completed() {
        this.setState({completed: true})
    }

    reset() {
        this.setState({completed: false})
    }
}

AutoFocus.propTypes = {
    children: PropTypes.any,
    element: PropTypes.object,
    focusEnabled: PropTypes.any
}

export default compose(
    AutoFocus,
    connect()
)
