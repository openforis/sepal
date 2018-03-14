import {dispatch} from 'store'
import actionBuilder from 'action-builder'
import guid from 'guid'
import {setError, toMessage} from 'app/error'

export default function asyncActionBuilder(type, action$, component) {
    if (!type) throw new Error('Action type is required')

    const componentId = component.id
    const actionId = `${componentId}:${type}:${guid()}`

    let actionsToDispatch = []
    const addActions = (actions) => {
        if (!actions) return
        if (!actions instanceof Array)
            actions = [actions]
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
                    console.log(error)
                    if (actions.length === 0)
                        addActions(setError(toMessage(error)))
                    addActions(
                        actionBuilder('ASYNC_ACTION_DISPATCHED', {componentId, actionType: type})
                            .del(['dispatching', componentId, actionId])
                            .build()
                    )
                    return dispatch({
                        type: type,
                        actions: actionsToDispatch
                    })
                },

                complete() {
                    addActions(onComplete && onComplete())
                    addActions(
                        actionBuilder('ASYNC_ACTION_DISPATCHED', {componentId, actionType: type})
                            .del(['dispatching', componentId, actionId])
                            .build()
                    )
                    return dispatch({
                        type: type,
                        actions: actionsToDispatch
                    })
                }
            }
            actionBuilder('ASYNC_ACTION_DISPATCHING', {componentId, actionType: type, notLogged: true})
                .set(['dispatching', componentId, actionId], type)
                .dispatch()
            cleanupStateWhenComponentUnMounts(component)
            action$
                .takeUntil(component.componentWillUnmount$)
                .subscribe(observer)
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