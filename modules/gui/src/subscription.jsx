import React, {useCallback, useEffect, useRef} from 'react'

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
    const subscriptionsRef = useRef([])

    const addSubscription = useCallback(subscription =>
        subscription && subscriptionsRef.current.push(subscription)
    , [])

    const addSubscriptions = useCallback((...currentSubscriptions) =>
        currentSubscriptions.forEach(
            subscription => addSubscription(subscription)
        )
    , [addSubscription])

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
            subscriptionsRef.current.forEach(subscription => unsubscribe(subscription))
        }
    }, [])

    return [addSubscriptions]
}
