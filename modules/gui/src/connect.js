import React from 'react'
import {connect as connectToRedux} from 'react-redux'
import {Subject, takeUntil} from 'rxjs'

import {actionBuilder} from '~/action-builder'
import {composeHoC} from '~/compose'
import {withPreventUpdateWhenDisabled} from '~/enabled'
import {isEqual} from '~/hash'
import {select} from '~/store'
import {uuid} from '~/uuid'

const withConnectedComponent = () =>
    WrappedComponent =>
        class ConnectedComponent extends React.PureComponent {
            constructor(props) {
                super(props)
                this.componentId = uuid()
                this.componentWillUnmount$ = new Subject()
                this.action = this.action.bind(this)
                this.stream = this.stream.bind(this)
            }

            render() {
                const {componentId} = this
                return React.createElement(WrappedComponent, {
                    ...this.props,
                    componentId,
                    action: this.action,
                    stream: this.stream,
                    componentWillUnmount$: this.componentWillUnmount$
                })
            }

            componentWillUnmount() {
                this.componentWillUnmount$.next()
                this.componentWillUnmount$.complete()
                this.removeStreamStatus()
            }

            action(type) {
                const actions = select('actions') || {}
                const componentActions = actions[this.componentId] || {}
                const undispatched = !componentActions[type]
                const dispatching = componentActions[type] === 'DISPATCHING'
                const completed = componentActions[type] === 'COMPLETED'
                const failed = componentActions[type] === 'FAILED'
                const dispatched = completed || failed
                return {undispatched, dispatching, completed, failed, dispatched}
            }

            setStreamStatus(name, status) {
                const {componentId} = this
                actionBuilder('SET_STREAM_STATUS', {componentId, name, status})
                    .set(['stream', componentId, name], status)
                    .dispatch()
            }
            
            getStreamStatus(name) {
                const {componentId} = this
                const status = select(['stream', componentId, name])
                return {
                    active: status === 'ACTIVE',
                    failed: status === 'FAILED',
                    completed: status === 'COMPLETED'
                }
            }

            removeStreamStatus() {
                const {componentId} = this
                actionBuilder('REMOVE_STREAM_STATUS', {componentId})
                    .del(['stream', componentId])
                    .dispatch()
            }

            getStream({name, stream$, onNext, onError, onComplete}) {
                if (stream$) {
                    this.setStreamStatus(name, 'ACTIVE')
                    stream$.pipe(
                        takeUntil(this.componentWillUnmount$)
                    ).subscribe({
                        next: value => {
                            onNext && onNext(value)
                        },
                        error: error => {
                            this.setStreamStatus(name, 'FAILED')
                            if (onError) {
                                onError(error)
                            } else {
                                throw error
                            }
                        },
                        complete: () => {
                            this.setStreamStatus(name, 'COMPLETED')
                            onComplete && onComplete()
                        }
                    })
                }
                return this.getStreamStatus(name)
            }

            stream(...args) {
                if (args.length === 1 && args[0].constructor === Object) {
                    // object arguments
                    const {name, stream$, onNext, onError, onComplete} = args[0]
                    return this.getStream({name, stream$, onNext, onError, onComplete})
                } else {
                    // positional arguments
                    const [name, stream$, onNext, onError, onComplete] = args
                    return this.getStream({name, stream$, onNext, onError, onComplete})
                }
            }
        }

// Include component streams to trigger rerender on stream updates.
const addComponentStreams = mapStateToProps =>
    (state, ownProps) => {
        const componentStreams = select(['stream', ownProps.componentId])
        return mapStateToProps
            ? {...mapStateToProps(state, ownProps), componentStreams}
            : {componentStreams}
    }

const withReduxState = mapStateToProps =>
    connectToRedux(addComponentStreams(mapStateToProps), null, null, {
        areStatePropsEqual: isEqual
    })

export const connect = mapStateToProps =>
    composeHoC(
        withPreventUpdateWhenDisabled(),
        withReduxState(mapStateToProps),
        withConnectedComponent()
    )
