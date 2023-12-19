import {compose} from 'compose'
import {connect} from 'store'
import {isMobile} from 'widget/userAgent'
import {withEnableDetector} from 'enabled'
import PropTypes from 'prop-types'
import React from 'react'

class AutoFocus extends React.Component {
    state = {
        completed: false
    }

    constructor(props) {
        super(props)
        this.reset = this.reset.bind(this)
        const {enableDetector: {onEnable}} = props
        onEnable(this.reset)
    }

    render() {
        const {children} = this.props
        return children
    }

    componentDidMount() {
        const {focusEnabled} = this.props
        if (!isMobile() && focusEnabled) {
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
    connect(),
    withEnableDetector()
)
