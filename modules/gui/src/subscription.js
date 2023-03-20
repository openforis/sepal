import React from 'react'

export const withSubscriptions = () =>
    WrappedComponent =>
        class WithSubscriptionHOC extends React.Component {
            subscriptions = []

            constructor() {
                super()
                this.addSubscription = this.addSubscription.bind(this)
            }

            render() {
                return React.createElement(WrappedComponent, {
                    ...this.props,
                    addSubscription: this.addSubscription
                })
            }

            addSubscription(...subscriptions) {
                subscriptions.forEach(subscription =>
                    subscription && this.subscriptions.push(subscription))
            }

            componentWillUnmount() {
                this.subscriptions.forEach(subscription => subscription.unsubscribe())
            }
        }
