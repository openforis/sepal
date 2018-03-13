import {dispatch, state} from 'store'
import actionBuilder from 'action-builder'
import guid from 'guid'

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
    let onComplete

    return {
        onComplete(callback) {
            onComplete = callback
            return this
        },

        dispatch() {
            const observer = {
                next(actions) {
                    addActions(actions)
                },

                error(error) {
                    console.log('Got an error dispatching ' + actionId + ':', error) // TODO: Handle errors somehow
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
                        actions: actionsToDispatch,
                        reduce() {
                            return actionsToDispatch.reduce(
                                (state, action) => action.reduce ? action.reduce(state) : state,
                                state()
                            )
                        }
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