import React, {useCallback, useEffect, useRef} from 'react'
import {Subscription} from 'rxjs'

// An rxjs Subscription is used as the teardown container: adding to an already-closed
// container (a late add after unmount) tears the subscription down immediately instead of
// leaking it, unsubscribing runs every teardown even if one throws, and completed rx
// subscriptions remove themselves from the container instead of accumulating until unmount.
const addToContainer = (container, subscription) => {
    if (subscription) {
        if (typeof subscription === 'function' || typeof subscription.unsubscribe === 'function') {
            container.add(subscription)
        } else {
            console.error('Cannot add unsupported subscription', subscription)
        }
    }
}

export const withSubscriptions = () =>
    WrappedComponent =>
        class WithSubscriptionHOC extends React.Component {
            subscriptions = new Subscription()

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
                    addToContainer(this.subscriptions, subscription)
                )
            }

            componentWillUnmount() {
                this.subscriptions.unsubscribe()
            }
        }

export const useSubscriptions = () => {
    const subscriptionsRef = useRef(null)

    if (!subscriptionsRef.current) {
        subscriptionsRef.current = new Subscription()
    }

    const addSubscriptions = useCallback((...subscriptions) =>
        subscriptions.forEach(subscription =>
            addToContainer(subscriptionsRef.current, subscription)
        )
    , [])

    useEffect(() => {
        return () => {
            subscriptionsRef.current.unsubscribe()
            // a Subscription cannot be reopened — recreate the container so an effect
            // re-run (e.g. StrictMode double-mount) doesn't instantly tear down later adds
            subscriptionsRef.current = new Subscription()
        }
    }, [])

    return [addSubscriptions]
}
