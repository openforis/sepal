import React from 'react'
import {name} from 'named'

export function observer(
    View,
    {
        reducers,
        componentWillMount,
        ...props
    }) {
    class Observer extends React.Component {
        constructor(props) {
            super(props)
            this.reducers = reducers
            this.subscriptions = []
        }

        componentWillMount() {
            this.reducers.forEach((reducer) => {
                const subscription = reducer.stream.subscribe((value) => {
                        this.setState((prevState) => {
                            const state = reducer.toState(value, prevState)
                            log({
                                component: Observer.displayName,
                                prevState: prevState,
                                stream: name(reducer.stream),
                                value: value,
                                state: state
                            })
                            return state
                        })
                    }
                )
                this.subscriptions.push(subscription)
            })

            if (componentWillMount)
                componentWillMount(this.props)
        }

        componentWillUnmount() {
            this.subscriptions.forEach((subscription) =>
                subscription.unsubscribe()
            )
        }

        render() {
            return React.createElement(View, {
                ...props,
                ...this.state
            })
        }
    }
    Observer.displayName = `Observer(${getDisplayName(View)})`
    return Observer
}

function getDisplayName(View) {
    return View.displayName || View.name || 'View'
}

function log({component, prevState, stream, value, state}) {
    console.group('notification', component)
    console.log('prevState:\t', prevState)
    console.log('stream:\t\t', stream)
    console.log('value:\t\t', value)
    console.log('state:\t\t', state)
    console.groupEnd()
}

export class Reducer {
    constructor(stream, toState) {
        this.stream = stream
        this.toState = toState
    }
}
