import React from 'react'
import {name} from 'named'

export function observer(
    View,
    {
        reducers,
        componentWillMount,
        ...props
    } = {reducers: []}) {
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
                            const stateUpdate = reducer.toState(value, prevState)
                            const state = {...prevState, ...stateUpdate}
                            log({
                                component: Observer.displayName,
                                prevState: prevState,
                                stream: name(reducer.stream),
                                value: value,
                                update: stateUpdate,
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

function log({component, prevState, stream, value, update, state}) {
    if (process.env.NODE_ENV === 'development') {
        console.group(stream, component)
        console.log('prevState:\t', prevState)
        console.log('value:\t\t', value)
        console.log('update:\t\t', update)
        console.log('state:\t\t', state)
        console.groupEnd()
    }
}

export class Reducer {
    constructor(stream, toState) {
        this.stream = stream
        this.toState = toState
    }
}
