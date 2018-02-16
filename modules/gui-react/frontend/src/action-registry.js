class ActionRegistry {
    reducers = {}

    register(actionType, reducer, actionCreator = () => ({})) {
        this.reducers[actionType] = reducer
        return (...args) => Object.assign({type: actionType}, actionCreator(...args))
    }

    rootReducer() {
        return (state = [], action) => {
            const reducer = this.reducers[action.type]
            return reducer ? reducer(state, action) : state
        }
    }
}

const actionRegistry = new ActionRegistry()
export default actionRegistry