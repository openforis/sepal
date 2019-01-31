import {delay, distinctUntilChanged, map} from 'rxjs/operators'
import {fromEvent, merge} from 'rxjs'
import PropTypes from 'prop-types'
import React from 'react'

const {Provider, Consumer} = React.createContext()

export class HoverProvider extends React.Component {
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

HoverProvider.propTypes = {
    children: PropTypes.any.isRequired,
    className: PropTypes.string
}

export const HoverConsumer = props =>
    <Consumer>
        {hover => props.children(hover)}
    </Consumer>

HoverConsumer.propTypes = {
    children: PropTypes.any.isRequired
}
