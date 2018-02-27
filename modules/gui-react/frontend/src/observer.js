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
                            const nextState = {...prevState, ...stateUpdate}
                            log({
                                component: Observer.displayName,
                                prevState: prevState,
                                stream: name(reducer.stream),
                                value: value,
                                update: stateUpdate,
                                nextState: nextState
                            })
                            return nextState
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

function log({component, prevState, stream, value, update, nextState}) {
    if (process.env.NODE_ENV === 'development') {
        console.group('%c' + stream, 'font-weight: lighter;', component)
        console.log('%cprevState:\t', 'color: #9E9E9E;', prevState)
        console.log('%cvalue:\t\t', 'color: #03A9F4;', value)
        console.log('%cupdate:\t\t', 'color: #F20404;', update)
        console.log('%cnextState:\t', 'color: #4CAF50;', nextState)
        console.groupEnd()
    }
}

export class Reducer {
    constructor(stream, toState) {
        this.stream = stream
        this.toState = toState
    }
}
