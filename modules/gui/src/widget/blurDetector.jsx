import _ from 'lodash'
import PropTypes from 'prop-types'
import React from 'react'
import {delay, distinctUntilChanged, filter, fromEvent, map, merge, sample, shareReplay, switchMap} from 'rxjs'

import {compose} from '~/compose'
import {withContext} from '~/context'
import {withForwardedRef} from '~/ref'
import {withSubscriptions} from '~/subscription'

import styles from './blurDetector.module.css'
import {isOverElement} from './dom'
import {withEventShield} from './eventShield'

const ANIMATION_DURATION_MS = 250

const Context = React.createContext()

const withBlurDetector = withContext(Context, 'blurDetector')

class _BlurDetector extends React.Component {
    enabled = true

    state = {
        fadeOut: false
    }

    constructor(props) {
        super(props)
        this.ref = props.forwardedRef || React.createRef()
        this.setEnabled = this.setEnabled.bind(this)
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
                <Context.Provider value={{setEnabled: this.setEnabled}}>
                    {children}
                </Context.Provider>
            </div>
        )
    }

    setEnabled(enabled) {
        return this.enabled = enabled
    }
    
    blurStart() {
        this.setState({fadeOut: true})
    }
    
    blurStop() {
        this.setState({fadeOut: false})
    }

    componentDidMount() {
        const {autoBlurTimeout, fadeOut, onBlur, addSubscription, eventShield} = this.props
        this.setParentEnabled(false)
        if (onBlur) {
            addSubscription(
                merge(
                    fromEvent(document, 'mousedown', {capture: true}),
                    fromEvent(document, 'touchstart', {capture: true}),
                    fromEvent(document, 'focus', {capture: true}),
                ).pipe(
                    filter(this.isEnabled),
                    map(e => this.isOver(e)),
                    filter(over => !over)
                ).subscribe(this.onBlur)
            )
            if (autoBlurTimeout) {
                const over$ = fromEvent(document, 'mousemove').pipe(
                    map(e => this.isOver(e)),
                    distinctUntilChanged(),
                    shareReplay({bufferSize: 1, refCount: true})
                )
                const enter$ = over$.pipe(
                    filter(over => over)
                )
                const leave$ = eventShield.enabled$.pipe(
                    switchMap(enabled => enabled
                        ? over$.pipe(
                            sample(eventShield.enabled$.pipe(
                                filter(enabled => !enabled)
                            ))
                        )
                        : over$
                    ),
                    filter(over => !over)
                )
                const away$ = enter$.pipe(
                    switchMap(() => leave$.pipe(
                        delay(autoBlurTimeout)
                    ))
                )
                addSubscription(
                    away$.subscribe(this.onBlur)
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
        this.setParentEnabled(true)
    }

    onBlur(e) {
        const {onBlur} = this.props
        if (onBlur) {
            onBlur(e)
        }
    }

    setParentEnabled(enabled) {
        const {blurDetector} = this.props
        if (blurDetector) {
            blurDetector.setEnabled(enabled)
        }
    }

    isEnabled() {
        return this.enabled
    }
    
    isOver(e) {
        return this.isRefEvent(e) || this.isExcludedEvent(e)
    }

    isRefEvent(e) {
        return isOverElement(e, this.ref.current)
    }

    isExcludedEvent(e) {
        const {exclude} = this.props
        return _.some(
            _.castArray(exclude),
            element => element && isOverElement(e, element)
        )
    }
}

export const BlurDetector = compose(
    _BlurDetector,
    withBlurDetector(),
    withEventShield(),
    withSubscriptions(),
    withForwardedRef(),
)

BlurDetector.propTypes = {
    children: PropTypes.any.isRequired,
    autoBlurTimeout: PropTypes.number,
    className: PropTypes.string,
    exclude: PropTypes.any,
    fadeOut: PropTypes.any,
    style: PropTypes.object,
    onBlur: PropTypes.func,
    onClick: PropTypes.func
}

BlurDetector.defaultProps = {
    autoBlurTimeout: 2000
}
