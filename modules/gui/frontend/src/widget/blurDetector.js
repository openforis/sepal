import {compose} from 'compose'
import {fromEvent, merge} from 'rxjs'
import PropTypes from 'prop-types'
import React from 'react'
import withSubscriptions from 'subscription'

class BlurDetector extends React.Component {
    element = React.createRef()

    render() {
        const {className, children} = this.props
        return (
            <div ref={this.element} className={className}>
                {children}
            </div>
        )
    }

    componentDidMount() {
        const {addSubscription} = this.props
        addSubscription(
            merge(
                fromEvent(document, 'click'),
                fromEvent(document, 'focus'),
            ).subscribe(
                e => this.onEvent(e)
            )
        )
    }

    onEvent(e) {
        const {onBlur} = this.props
        const inside = this.element.current.contains(e.target)
        if (!inside)
            onBlur()
    }
}

export default compose(
    BlurDetector,
    withSubscriptions
)

BlurDetector.propTypes = {
    children: PropTypes.any.isRequired,
    onBlur: PropTypes.func.isRequired,
    className: PropTypes.string
}
