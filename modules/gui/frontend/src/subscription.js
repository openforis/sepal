import React from 'react'

const withSubscriptions = WrappedComponent =>
    class HigherOrderComponent extends React.Component {
        subscriptions = []
        render() {
            return React.createElement(WrappedComponent, {
                ...this.props,
                addSubscription: (...subscriptions) => {
                    subscriptions.forEach(subscription =>
                        this.subscriptions.push(subscription))
                }
            })
        }
        componentWillUnmount() {
            this.subscriptions.forEach(subscription => subscription.unsubscribe())
        }
    }

export default withSubscriptions
