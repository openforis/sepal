import React from 'react'
import Rx from 'rxjs'

function subscriber(
    {
        componentWillMount,
        componentWillReceiveProps,
        componentWillUpdate,
        render,
        componentDidMount,
        componentDidUpdate,
        componentDidCatch,
        componentWillUnmount
    }) {
    return (WrappedComponent) => {
        class Subscriber extends React.Component {
            constructor(props) {
                super(props)
                const componentWillUnmount$ = new Rx.Subject().take(1)
                this.streams = {
                    componentWillMount$: new Rx.Subject().take(1),
                    componentWillReceiveProps$: new Rx.Subject().takeUntil(componentWillUnmount$),
                    componentWillUpdate$: new Rx.Subject().takeUntil(componentWillUnmount$),
                    render$: new Rx.Subject().takeUntil(componentWillUnmount$),
                    componentDidMount$: new Rx.Subject().take(1),
                    componentDidUpdate$: new Rx.Subject().takeUntil(componentWillUnmount$),
                    componentDidCatch$: new Rx.Subject().takeUntil(componentWillUnmount$),
                    componentWillUnmount$: componentWillUnmount$
                }
            }

            subscribe(description, stream$, observer) {
                const wrappedHandler = (handler) =>
                    (e) => {
                        if (!handler)
                            return
                        const value = handler(e)
                        if (typeof value === 'function')
                            this.setState((prevState) => {
                                const nextState = value(prevState)
                                log({
                                    component: Subscriber.displayName,
                                    description: description,
                                    prevState: prevState,
                                    value: e,
                                    nextState: nextState
                                })
                                return nextState
                            })
                        else if (value !== null) {
                            this.setState((prevState) => {
                                const nextState = {...prevState, ...value}
                                log({
                                    component: Subscriber.displayName,
                                    description: description,
                                    prevState: prevState,
                                    value: e,
                                    update: value,
                                    nextState: nextState
                                })
                                return nextState
                            })
                        } else {
                            log({
                                component: Subscriber.displayName,
                                description: description,
                                value: e,
                                nextState: this.state
                            })
                        }
                    }

                const isObserverObject = typeof observer === 'object'
                const wrappedObserver = {
                    next: wrappedHandler(isObserverObject ? observer.next : observer),
                    error: wrappedHandler(isObserverObject ? observer.error : null),
                    complete: wrappedHandler(isObserverObject ? observer.complete : null)
                }
                return stream$.takeUntil(this.streams.componentWillUnmount$).subscribe(wrappedObserver)
            }

            componentWillMount() {
                this.streams.componentWillMount$.next(true)
                componentWillMount && componentWillMount.bind(this)()
            }

            componentWillReceiveProps(nextProps) {
                this.streams.componentWillReceiveProps$.next(nextProps)
                componentWillReceiveProps && componentWillReceiveProps.bind(this)(nextProps)
            }

            componentWillUpdate(nextProps, nextState) {
                this.streams.componentWillUpdate$.next({nextProps, nextState})
                componentWillUpdate && componentWillUpdate.bind(this)(nextProps, nextState)
            }

            render() {
                this.streams.render$.next()
                render && render.bind(this)()
                return React.createElement(WrappedComponent, {
                    ...this.props,
                    ...this.state,
                    subscribe: this.subscribe.bind(this)
                })
            }

            componentDidMount() {
                this.streams.componentDidMount$.next()
                componentDidMount && componentDidMount.bind(this)()
            }

            componentDidUpdate(prevProps, prevState) {
                this.streams.componentDidUpdate$.next({prevProps, prevState})
                componentDidUpdate && componentDidUpdate.bind(this)(prevProps, prevState)
            }

            componentWillUnmount() {
                this.streams.componentWillUnmount$.next()
                componentWillUnmount && componentWillUnmount.bind(this)()
            }

            componentDidCatch(error, info) {
                this.streams.componentDidCatch$.next({error, info})
                componentDidCatch && componentDidCatch.bind(componentDidCatch)(error, info)
            }
        }

        Subscriber.displayName = WrappedComponent.displayName || WrappedComponent.name || 'Component'
        return Subscriber
    }
}

export default subscriber

function log({component, prevState, description, value, update, nextState}) {
    if (process.env.NODE_ENV === 'development') {
        console.group('%c' + component + '%c - ' + description, 'font-weight: bold;', 'font-weight: lighter;')
        if (prevState)
            console.log('%cprevState:\t', 'color: #9E9E9E;', prevState)
        if (value)
            console.log('%cvalue:\t\t', 'color: #03A9F4;', value)
        if (update)
            console.log('%cupdate:\t\t', 'color: #F20404;', update)
        if (nextState)
            console.log('%cnextState:\t', 'color: #4CAF50;', nextState)
        console.groupEnd()
    }
}