import {compose} from 'compose'
import {filter, fromEvent, merge} from 'rxjs'
import {withContext} from 'context'
import PropTypes from 'prop-types'
import React from 'react'
import _ from 'lodash'
import withForwardedRef from 'ref'
import withSubscriptions from 'subscription'

const BlurDetectorContext = React.createContext()

const withBlurDetectorContext = withContext(BlurDetectorContext, 'blurDetectorContext')

// const isOver = (e, element) => {
//     if (e instanceof MouseEvent) {
//         if (element) {
//             const {clientX, clientY} = e
//             const {x, y, width, height} = element.getBoundingClientRect()
//             return (clientX >= x) && (clientX < x + width) && (clientY >= y) && (clientY < y + height)
//         }
//         return false
//     }
//     return true
// }

const isOver = (e, element) => {
    return element.contains(e.target)
}

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
            addSubscription(
                merge(
                    fromEvent(document, 'mousedown', {capture: true}),
                    fromEvent(document, 'touchstart', {capture: true}),
                    fromEvent(document, 'focus', {capture: true}),
                ).pipe(
                    filter(() => this.enabled),
                    // debounceTime(150) // prevent click-through
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
        const {onBlur} = this.props
        if (onBlur && !this.isRefEvent(e) && !this.isExcludedEvent(e)) {
            onBlur(e)
        }
    }

    isRefEvent(e) {
        return isOver(e, this.ref.current)
    }

    isExcludedEvent(e) {
        const {exclude} = this.props
        return _.some(_.castArray(exclude), exclude => exclude && isOver(e, exclude))
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
    exclude: PropTypes.oneOfType([
        PropTypes.arrayOf(PropTypes.elementType),
        PropTypes.elementType
    ]),
    style: PropTypes.object,
    onBlur: PropTypes.func
}
