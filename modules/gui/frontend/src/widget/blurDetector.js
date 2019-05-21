import {fromEvent, merge} from 'rxjs'
import PropTypes from 'prop-types'
import React from 'react'

export default class BlurDetector extends React.Component {
    subscriptions = []
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
        this.subscriptions.push(
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

    componentWillUnmount() {
        this.subscriptions.forEach(subscription => subscription.unsubscribe())
    }
}

BlurDetector.propTypes = {
    children: PropTypes.any.isRequired,
    onBlur: PropTypes.func.isRequired,
    className: PropTypes.string
}
