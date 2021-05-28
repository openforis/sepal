import {compose} from 'compose'
import {fromEvent, merge} from 'rxjs'
import PropTypes from 'prop-types'
import React from 'react'
import withForwardedRef from 'ref'
import withSubscriptions from 'subscription'

class BlurDetector extends React.Component {
    constructor(props) {
        super(props)
        this.ref = props.forwardedRef || React.createRef()
    }

    render() {
        const {className, style, children} = this.props
        return (
            <div ref={this.ref} className={className} style={style}>
                {children}
            </div>
        )
    }

    componentDidMount() {
        const {onBlur, addSubscription} = this.props
        if (onBlur) {
            addSubscription(
                merge(
                    fromEvent(document, 'mousedown'),
                    fromEvent(document, 'touchstart'),
                    fromEvent(document, 'focus'),
                ).subscribe(
                    e => this.onEvent(e)
                )
            )
        }
    }

    onEvent(e) {
        const {onBlur} = this.props
        const inside = this.ref.current.contains(e.target)
        if (!inside) {
            onBlur && onBlur(e)
        }
    }
}

export default compose(
    BlurDetector,
    withSubscriptions(),
    withForwardedRef()
)

BlurDetector.propTypes = {
    children: PropTypes.any.isRequired,
    className: PropTypes.string,
    style: PropTypes.object,
    onBlur: PropTypes.func
}
