import {compose} from 'compose'
import {delay, distinctUntilChanged, filter, fromEvent, map, merge, switchMap} from 'rxjs'
import {withContext} from 'context'
import {withForwardedRef} from 'ref'
import {withSubscriptions} from 'subscription'
import PropTypes from 'prop-types'
import React from 'react'
import _ from 'lodash'
import styles from './blurDetector.module.css'

const ANIMATION_DURATION_MS = 500

const Context = React.createContext()

const withBlurDetector = withContext(Context, 'blurDetector')

const isOver = (e, element) => {
    return element.contains(e.target)
}

class _BlurDetector extends React.Component {
    enabled = true

    state = {
        fadeOut: false
    }

    constructor(props) {
        super(props)
        this.ref = props.forwardedRef || React.createRef()
        this.checkEnabled = this.checkEnabled.bind(this)
        this.isEnabled = this.isEnabled.bind(this)
        this.onBlur = this.onBlur.bind(this)
        this.blurStart = this.blurStart.bind(this)
        this.blurStop = this.blurStop.bind(this)
    }

    render() {
        const {className, style, children, onClick} = this.props
        const {fadeOut} = this.state
        return (
            <div
                ref={this.ref}
                className={[
                    className,
                    fadeOut ? styles.fadeOut : null
                ].join(' ')}
                style={{...style, '--animation-duration-ms': ANIMATION_DURATION_MS}}
                onClick={onClick}>
                <Context.Provider value={{enabled: this.checkEnabled}}>
                    {children}
                </Context.Provider>
            </div>
        )
    }

    checkEnabled(enabled) {
        return this.enabled = enabled
    }
    
    blurStart() {
        this.setState({fadeOut: true})
    }
    
    blurStop() {
        this.setState({fadeOut: false})
    }

    componentDidMount() {
        const {autoBlurTimeout, fadeOut, onBlur, addSubscription} = this.props
        this.setEnabled(false)
        if (onBlur) {
            addSubscription(
                merge(
                    fromEvent(document, 'mousedown', {capture: true}),
                    fromEvent(document, 'touchstart', {capture: true}),
                    fromEvent(document, 'focus', {capture: true}),
                ).pipe(
                    filter(this.isEnabled),
                    filter(e => !this.isOver(e))
                ).subscribe(this.onBlur)
            )
            if (autoBlurTimeout) {
                const over$ = fromEvent(document, 'mousemove').pipe(
                    map(e => this.isOver(e)),
                    distinctUntilChanged()
                )
                const enter$ = over$.pipe(
                    filter(over => over)
                )
                const leave$ = over$.pipe(
                    filter(over => !over)
                )
                addSubscription(
                    enter$.pipe(
                        switchMap(() => leave$.pipe(
                            delay(autoBlurTimeout)
                        ))
                    ).subscribe(this.onBlur)
                )
                if (fadeOut) {
                    addSubscription(
                        enter$.subscribe(this.blurStop),
                        enter$.pipe(
                            switchMap(() => leave$.pipe(
                                delay(autoBlurTimeout - ANIMATION_DURATION_MS)
                            ))
                        ).subscribe(this.blurStart),
                    )
                }
            }
        }
    }

    componentWillUnmount() {
        this.setEnabled(true)
    }

    onBlur(e) {
        const {onBlur} = this.props
        if (onBlur) {
            onBlur(e)
        }
    }

    setEnabled(enabled) {
        const {blurDetector} = this.props
        if (blurDetector) {
            blurDetector.enabled(enabled)
        }
    }

    isEnabled() {
        const {enabled} = this
        return enabled
    }
    
    isOver(e) {
        return this.isRefEvent(e) || this.isExcludedEvent(e)
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

export const BlurDetector = compose(
    _BlurDetector,
    withBlurDetector(),
    withSubscriptions(),
    withForwardedRef(),
)

BlurDetector.propTypes = {
    children: PropTypes.any.isRequired,
    autoBlurTimeout: PropTypes.number,
    className: PropTypes.string,
    // exclude: PropTypes.oneOfType([
    //     PropTypes.arrayOf(PropTypes.elementType),
    //     PropTypes.elementType,
    //     // null
    // ]),
    exclude: PropTypes.any,
    fadeOut: PropTypes.any,
    style: PropTypes.object,
    onBlur: PropTypes.func,
    onClick: PropTypes.func
}

BlurDetector.defaultProps = {
    autoBlurTimeout: 2000
}
