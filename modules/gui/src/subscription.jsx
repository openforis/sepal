import React, {useEffect} from 'react'

export const withSubscriptions = () =>
    WrappedComponent =>
        class WithSubscriptionHOC extends React.Component {
            subscriptions = []

            constructor(props) {
                super(props)
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

export const useSubscriptions = () => {
    const subscriptions = []
        
    const addSubscription = subscription =>
        subscription && subscriptions.push(subscription)

    const addSubscriptions = (...currentSubscriptions) =>
        currentSubscriptions.forEach(
            subscription => addSubscription(subscription)
        )

    const unsubscribe = subscription => {
        if (typeof subscription === 'function') {
            return subscription()
        }
        if (subscription.unsubscribe) {
            return subscription.unsubscribe()
        }
        console.error('Cannot unsubscribe unsupported subscription', subscription)
    }
        
    useEffect(() => {
        return () => {
            subscriptions.forEach(subscription => unsubscribe(subscription))
        }
    }, [])
        
    return [addSubscriptions]
}
