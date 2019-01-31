import {delay, distinctUntilChanged, map} from 'rxjs/operators'
import {fromEvent, merge} from 'rxjs'
import PropTypes from 'prop-types'
import React from 'react'
import styles from './hover.module.css'

const {Provider, Consumer} = React.createContext()

export class HoverDetector extends React.Component {
    state = {
        hover: false
    }

    ref = React.createRef()
    subscriptions = []

    componentDidMount() {
        const button = this.ref.current
        const mouseOver$ = fromEvent(button, 'mouseover')
        const mouseLeave$ = fromEvent(button, 'mouseleave')
        
        const mouseStatus$ = merge(
            mouseOver$.pipe(
                map(() => true)
            ),
            mouseLeave$.pipe(
                map(() => false)
            )
        ).pipe(
            distinctUntilChanged(),
            // [HACK] Prevent click-through on Android devices
            delay(0)
        )

        this.subscriptions.push(
            mouseStatus$.subscribe(hover => this.setState({hover}))
        )
    }

    componentWillUnmount() {
        this.subscriptions.forEach(subscription => subscription.unsubscribe())
    }

    render() {
        const {hover} = this.state
        const {className, children} = this.props
        return (
            <Provider value={hover}>
                <div ref={this.ref} className={className}>
                    {children}
                </div>
            </Provider>
        )
    }
}

HoverDetector.propTypes = {
    children: PropTypes.any.isRequired,
    className: PropTypes.string
}

export const HoverOverlay = props =>
    <Consumer>
        {hover => hover
            ? (
                <div className={[styles.overlay, hover ? styles.hover : null].join(' ')}>
                    {props.children}
                </div>
            ) : null
        }
    </Consumer>

HoverOverlay.propTypes = {
    children: PropTypes.any.isRequired
}
