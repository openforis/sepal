import {dispatch} from 'store'
import {toPathList} from 'collections'
import immutable from 'object-path-immutable'

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
            operations.push((immutableState, state) => {
                const pathList = toPathList(path)
                const prevValue = select(pathList, state)
                if (prevValue !== value)
                    return value
                        ? immutableState.set(pathList, value)
                        : immutableState.del(pathList)
            })
            return this
        },

        setAll(values) {
            Object.keys(values).forEach((path) =>
                this.set(path, values[path]))
            return this
        },

        push(path, value) {
            operations.push((immutableState) => {
                return immutableState.push(toPathList(path), value)
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
                    return immutableState.push(toPathList(path), value)
            })
            return this
        },

        del(path) {
            operations.push((immutableState) => immutableState.del(toPathList(path)))
            return this
        },

        delValueByKey(path, key, keyValue) {
            path = toPathList(path)

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
            path = toPathList(path)

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
            operations.push((immutableState) => immutableState.assign(toPathList(path), source))
            return this
        },

        build() {
            const performOperation = (immutableState, operation) => {
                const state = immutableState.value()
                return operation(immutable(state), state) || immutableState
            }
            return {
                type,
                ...props,
                reduce(state) {
                    if (!prefix) {
                        var nextState = operations.reduce(
                            performOperation,
                            immutable(state)
                        ).value()
                        sideEffects.forEach(sideEffect => sideEffect(nextState))
                        return nextState
                    } else {
                        const subState = operations.reduce(
                            performOperation,
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
    return toPathList(path).reduce((state, part) => {
        return state != null && state[part] != null ? state[part] : undefined
    }, state)
}
