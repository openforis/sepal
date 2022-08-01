import {compose} from 'compose'
import {delay, distinctUntilChanged, filter, fromEvent, map, merge, of, scan, switchMap, takeUntil} from 'rxjs'
import {withContext} from 'context'
import PropTypes from 'prop-types'
import React from 'react'
import _ from 'lodash'
import withForwardedRef from 'ref'
import withSubscriptions from 'subscription'

const BlurDetectorContext = React.createContext()

const withBlurDetectorContext = withContext(BlurDetectorContext, 'blurDetectorContext')

const isOver = (e, element) => {
    return element.contains(e.target)
}

class BlurDetector extends React.Component {
    enabled = true

    constructor(props) {
        super(props)
        this.ref = props.forwardedRef || React.createRef()
        this.isEnabled = this.isEnabled.bind(this)
        this.onEvent = this.onEvent.bind(this)
        this.onTimeout = this.onTimeout.bind(this)
    }

    render() {
        const {className, style, children, onClick} = this.props
        return (
            <div
                ref={this.ref}
                className={className}
                style={style}
                onClick={onClick}>
                <BlurDetectorContext.Provider value={{enabled: enabled => this.enabled = enabled}}>
                    {children}
                </BlurDetectorContext.Provider>
            </div>
        )
    }

    componentDidMount() {
        const {autoBlurTimeout, onBlur, addSubscription} = this.props
        this.setEnabled(false)
        if (onBlur) {
            addSubscription(
                merge(
                    fromEvent(document, 'mousedown', {capture: true}),
                    fromEvent(document, 'touchstart', {capture: true}),
                    fromEvent(document, 'focus', {capture: true}),
                ).pipe(
                    filter(this.isEnabled),
                    // debounceTime(150) // prevent click-through
                ).subscribe(this.onEvent)
            )
            if (autoBlurTimeout) {
                const inside$ = fromEvent(document, 'mousemove').pipe(
                    map(e => this.isRefEvent(e) || this.isExcludedEvent(e)),
                    distinctUntilChanged()
                )
                const enter$ = inside$.pipe(
                    filter(inside => inside)
                )
                const leave$ = inside$.pipe(
                    filter(inside => !inside)
                )
                addSubscription(
                    leave$.pipe(
                        switchMap(e => of(e).pipe(
                            delay(autoBlurTimeout),
                            takeUntil(enter$)
                        ))
                    ).subscribe(this.onTimeout)
                )
            }
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

    isEnabled() {
        const {enabled} = this
        return enabled
    }

    onEvent(e) {
        const {onBlur} = this.props
        if (onBlur && !this.isRefEvent(e) && !this.isExcludedEvent(e)) {
            onBlur(e)
        }
    }

    onTimeout(e) {
        const {onBlur} = this.props
        if (onBlur) {
            onBlur(e)
        }
    }

    isRefEvent(e) {
        return isOver(e, this.ref.current)
    }

    isExcludedEvent(e) {
        const {exclude} = this.props
        return _.some(
            _.castArray(exclude),
            element => element && isOver(e, element)
        )
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
    autoBlurTimeout: PropTypes.number,
    className: PropTypes.string,
    exclude: PropTypes.oneOfType([
        PropTypes.arrayOf(PropTypes.elementType),
        PropTypes.elementType,
        null
    ]),
    style: PropTypes.object,
    onBlur: PropTypes.func,
    onClick: PropTypes.func
}

BlurDetector.defaultProps = {
    autoBlurTimeout: 2000
}
