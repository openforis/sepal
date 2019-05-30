import {dispatch} from 'store'
import {msg} from 'translate'
import {takeUntil} from 'rxjs/operators'
// import Notifications from 'widget/notifications'
import actionBuilder from 'action-builder'

export default function asyncActionBuilder(type, action$, component) {
    if (!type) throw Error('Action type is required')

    // Force warning for non-existing translations. Otherwise this would only be noticed on error.
    msg('action.type.' + type)

    const componentId = component.id

    let actionsToDispatch = []
    const addActions = actions => {
        if (!actions) return
        actions instanceof Array || (actions = [actions])
        actionsToDispatch = actionsToDispatch.concat(actions)
    }
    let onComplete, onError

    return {
        onComplete(callback) {
            onComplete = callback
            return this
        },

        onError(callback) {
            onError = callback
            return this
        },

        dispatch() {
            const observer = {
                next(actions) {
                    addActions(actions)
                },

                error(error) {
                    let actions = onError ? onError(error) : []
                    if (actions && !(actions instanceof Array))
                        actions = [actions]
                    actions.forEach(action => addActions(action))
                    if (actions.length === 0)
                    // TODO: fix this!
                    // Notifications.caught(
                    //     'action',
                    //     {action: msg('action.type.' + type, {}, type)},
                    //     error
                    // )
                        addActions(
                            actionBuilder('ASYNC_ACTION_DISPATCHED', {componentId, actionType: type})
                                .set(['actions', componentId, type], 'FAILED')
                                .build()
                        )
                    return dispatch({
                        type: type,
                        actions: actionsToDispatch
                    })
                },

                complete() {
                    addActions(onComplete && onComplete(actionsToDispatch))
                    addActions(
                        actionBuilder('ASYNC_ACTION_DISPATCHED', {componentId, actionType: type})
                            .set(['actions', componentId, type], 'COMPLETED')
                            .build()
                    )
                    return dispatch({
                        type: type,
                        actions: actionsToDispatch
                    })
                }
            }
            actionBuilder('ASYNC_ACTION_DISPATCHING', {componentId, actionType: type, notLogged: true})
                .set(['actions', componentId, type], 'DISPATCHING')
                .dispatch()
            cleanupStateWhenComponentUnMounts(component)
            action$.pipe(
                takeUntil(component.componentWillUnmount$)
            ).subscribe(observer)
        }
    }
}

function cleanupStateWhenComponentUnMounts(component) {
    component.componentWillUnmount$.subscribe(() =>
        actionBuilder('ASYNC_ACTION_REMOVE_COMPONENT', {componentId: component.id, notLogged: true})
            .del(['dispatching', component.id])
            .dispatch()
    )
}
