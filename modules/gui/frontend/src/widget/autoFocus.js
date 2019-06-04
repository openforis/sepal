import {compose} from 'compose'
import PropTypes from 'prop-types'
import React from 'react'
import withForwardedRef from 'ref'

class AutoFocus extends React.Component {
    focusHolderRef = React.createRef()
    state = {completed: false}

    render() {
        const {completed} = this.state
        return completed ? null : <div ref={this.focusHolderRef} tabIndex={-1}/>
    }

    shouldComponentUpdate(nextProps) {
        const {enabled} = nextProps
        return !!enabled
    }

    componentDidMount() {
        const {enabled} = this.props
        if (enabled) {
            const focusHolderElement = this.focusHolderRef.current
            focusHolderElement && focusHolderElement.focus()
            this.update()
        }
    }

    componentDidUpdate() {
        this.update()
    }

    update() {
        const {forwardedRef, enabled} = this.props
        const focusHolderElement = this.focusHolderRef.current
        const element = forwardedRef.current
        if (!enabled || !element || !focusHolderElement) {
            return
        }

        if (document.activeElement !== focusHolderElement) {
            this.setState({completed: true})
            return
        }

        element.focus()
        if (document.activeElement === element) {
            this.setState({completed: true})
        }
    }
}

export default compose(
    AutoFocus,
    withForwardedRef()
)

AutoFocus.propTypes = {
    enabled: PropTypes.any,
    forwardedRef: PropTypes.object
}

