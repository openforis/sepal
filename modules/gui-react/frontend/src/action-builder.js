import immutable from 'object-path-immutable'
import {dispatch} from 'store'

export default function actionBuilder(type, props) {
    const operations = []
    const sideEffects = []
    let prefix = ''
    return {
        within(_prefix) {
            prefix = _prefix
            return this
        },
        withState(path, callback) {
            operations.push((immutableState) => {
                const currentState = immutableState.value()
                const selectedState = select(path, currentState)
                return callback(selectedState, immutable(currentState))
            })
            return this
        },

        set(path, value) {
            operations.push((immutableState) => immutableState.set(path, value))
            return this
        },

        setAll(values) {
            Object.keys(values).forEach((path) =>
                operations.push((immutableState) => immutableState.set(path, values[path])))
            return this
        },

        push(path, value) {
            operations.push((immutableState) => {
                return immutableState.push(path, value)
            })
            return this
        },

        sideEffect(callback) {
            sideEffects.push(callback)
            return this
        },

        pushIfMissing(path, value, uniqueKeyProp) {
            operations.push((immutableState) => {
                const currentState = immutableState.value()
                immutableState = immutable(currentState)
                const collection = select(path, currentState)
                const equals = (item) => uniqueKeyProp
                    ? item[uniqueKeyProp] === value[uniqueKeyProp]
                    : item === value

                if (collection && collection.find(equals))
                    return immutableState
                else
                    return immutableState.push(path, value)
            })
            return this
        },

        del(path) {
            operations.push((immutableState) => immutableState.del(path))
            return this
        },

        delValueByKey(path, key, keyValue) {
            if (typeof path === 'string')
                path = path.split('.')

            operations.push((immutableState) => {
                const currentState = immutableState.value()
                immutableState = immutable(currentState)
                const index = select(path, currentState).findIndex((value) => value[key] === keyValue)
                return (index !== -1)
                    ? immutableState.del([...path, index])
                    : immutableState
            })
            return this
        },

        delValue(path, value) {
            if (typeof path === 'string')
                path = path.split('.')

            operations.push((immutableState) => {
                const currentState = immutableState.value()
                immutableState = immutable(currentState)
                const index = select(path, currentState).indexOf(value)
                return (index !== -1)
                    ? immutableState.del([...path, index])
                    : immutableState
            })
            return this
        },

        assign(path, source) {
            operations.push((immutableState) => immutableState.assign(path, source))
            return this
        },

        build() {
            return {
                type,
                ...props,
                reduce(state) {
                    if (!prefix) {
                        sideEffects.forEach(sideEffect => sideEffect(state))
                        return operations.reduce(
                            (immutableState, operation) => operation(immutableState) || immutableState,
                            immutable(state)
                        ).value()
                    } else {
                        const subState = operations.reduce(
                            (immutableState, operation) => operation(immutableState) || immutableState,
                            immutable(select(prefix, state))
                        ).value()
                        sideEffects.forEach(sideEffect => sideEffect(subState))
                        return immutable(state).set(prefix, subState).value()
                    }
                },
                dispatch() {
                    dispatch(this)
                }
            }
        },

        dispatch() {
            dispatch(this.build())
        }
    }
}

function select(path, state) {
    if (typeof path === 'string')
        path = path.split('.')
    return path.reduce((state, part) => {
        return state != null && state[part] != null ? state[part] : undefined
    }, state)
}