class ReducerRegistry {
    reducers = {}

    register(actionType, reducer) {
        this.reducers[actionType] = reducer
        return actionType
    }

    rootReducer() {
        return (state = [], action) => {
            const reducer = this.reducers[action.type]
            return reducer ? reducer(state, action) : state
        }
    }
}

const reducerRegistry = new ReducerRegistry()

export default reducerRegistry