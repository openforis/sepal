import {compose} from 'compose'
import {filter, fromEvent, merge} from 'rxjs'
import {withContext} from 'context'
import PropTypes from 'prop-types'
import React from 'react'
import withForwardedRef from 'ref'
import withSubscriptions from 'subscription'

const BlurDetectorContext = React.createContext()

const withBlurDetectorContext = withContext(BlurDetectorContext, 'blurDetectorContext')

class BlurDetector extends React.Component {
    enabled = true

    constructor(props) {
        super(props)
        this.ref = props.forwardedRef || React.createRef()
    }

    render() {
        const {className, style, children} = this.props
        return (
            <div ref={this.ref} className={className} style={style}>
                <BlurDetectorContext.Provider value={{enabled: enabled => this.enabled = enabled}}>
                    {children}
                </BlurDetectorContext.Provider>
            </div>
        )
    }

    componentDidMount() {
        const {onBlur, addSubscription} = this.props
        this.setEnabled(false)
        if (onBlur) {
            const mainElement = document.getElementById('main')
            addSubscription(
                merge(
                    fromEvent(mainElement, 'mousedown', {capture: true}),
                    fromEvent(mainElement, 'touchstart', {capture: true}),
                    fromEvent(mainElement, 'focus', {capture: true}),
                ).pipe(
                    filter(() => this.enabled)
                ).subscribe(
                    e => this.onEvent(e)
                )
            )
        }
    }

    componentWillUnmount() {
        this.setEnabled(true)
    }

    setEnabled(enabled) {
        const {blurDetectorContext} = this.props
        if (blurDetectorContext) {
            blurDetectorContext.enabled(enabled)
        }
    }

    onEvent(e) {
        const {excludeElement, onBlur} = this.props
        const inside = this.ref.current.contains(e.target) || (excludeElement && excludeElement.contains(e.target))
        if (!inside) {
            onBlur && onBlur(e)
        }
    }
}

export default compose(
    BlurDetector,
    withBlurDetectorContext(),
    withSubscriptions(),
    withForwardedRef(),
)

BlurDetector.propTypes = {
    children: PropTypes.any.isRequired,
    className: PropTypes.string,
    excludeElement: PropTypes.any,
    style: PropTypes.object,
    onBlur: PropTypes.func
}
