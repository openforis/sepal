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

            unsubscribe(subscription) {
                if (typeof subscription === 'function') {
                    return subscription()
                }
                if (subscription.unsubscribe) {
                    return subscription.unsubscribe()
                }
                console.error('Cannot unsubscribe unsupported subscription', subscription)
            }

            componentWillUnmount() {
                this.subscriptions.forEach(
                    subscription => this.unsubscribe(subscription)
                )
            }
        }
