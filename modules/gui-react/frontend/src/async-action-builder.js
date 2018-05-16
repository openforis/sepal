import actionBuilder from 'action-builder'
import Notifications from 'app/notifications'
import {takeUntil} from 'rxjs/operators'
import {dispatch} from 'store'
import {msg} from 'translate'

export default function asyncActionBuilder(type, action$, component) {
    if (!type) throw new Error('Action type is required')

    const componentId = component.id

    let actionsToDispatch = []
    const addActions = (actions) => {
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
                    actions.forEach((action) => addActions(action))
                    console.log('error', error)
                    if (actions.length === 0)
                        addActions(Notifications.caught(
                            'action',
                            {action: msg('action.type.' + type, {}, type)},
                            error
                        ))
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