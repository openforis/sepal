import React from 'react'

const withSubscriptions = () =>
    WrappedComponent =>
        class WithSubscriptionHoC extends React.Component {
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

export default withSubscriptions
