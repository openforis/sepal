import {dispatch} from 'store'
import {resolve} from 'stateUtils'
import _ from 'lodash'
import immutable from 'object-path-immutable'

const actionBuilder = (type, props) => {
    const operations = []
    const sideEffects = []
    let prefix = ''

    return {
        forEach(paths, callback) {
            _.forEach(paths, (path, key) => callback(this, path, key))
            return this
        },

        within(_prefix) {
            prefix = _prefix
            return this
        },

        withState(path, callback) {
            operations.push((immutableState, state) => {
                const prevValue = resolve(state, path).value
                return callback(prevValue, immutableState)
            })
            return this
        },

        set(path, value) {
            operations.push((immutableState, state) => {
                const resolver = resolve(state, path)
                const prevValue = resolver.value
                if (prevValue !== value)
                    return immutableState.set(resolver.path, value)
            })
            return this
        },

        sort(path, key) {
            operations.push((immutableState, state) => {
                const resolver = resolve(state, path)
                return immutableState.set(resolver.path, _.orderBy(resolver.value, key))
            })
            return this
        },

        assign(path, value) {
            operations.push((immutableState, state) =>
                immutableState.assign(resolve(state, path).path, value)
            )
            return this
        },

        merge(path, value) {
            operations.push((immutableState, state) =>
                immutableState.merge(resolve(state, path).path, value)
            )
            return this
        },

        setAll(values) {
            Object.keys(values).forEach(path =>
                this.set(path, values[path]))
            return this
        },

        map(path, callback) {
            operations.push((immutableState, state) => {
                const resolver = resolve(state, path)
                const collection = resolver.value
                if (!Array.isArray(collection)) return immutableState
                return collection
                    .map(callback)
                    .map((value, index) => ({index, value}))
                    .filter(({index, value}) => value !== collection[index])
                    .reduce((immutableState, {index, value}) => immutableState.set([resolver.path, index], value), immutableState)
            })
            return this
        },

        push(path, value) {
            operations.push((immutableState, state) => {
                return immutableState.push(resolve(state, path).path, value)
            })
            return this
        },

        unshift(path, value) {
            operations.push((immutableState, state) => {
                return immutableState.insert(resolve(state, path).path, value, 0)
            })
            return this
        },

        sideEffect(callback) {
            sideEffects.push(callback)
            return this
        },

        pushIfMissing(path, value, uniqueKeyProp) {
            operations.push((immutableState, state) => {
                const resolver = resolve(state, path)
                const collection = resolver.value
                const equals = item => uniqueKeyProp
                    ? item[uniqueKeyProp] === value[uniqueKeyProp]
                    : item === value

                if (collection && collection.find(equals))
                    return immutableState
                else
                    return immutableState.push(resolver.path, value)
            })
            return this
        },

        del(path) {
            operations.push((immutableState, state) => {
                const resolver = resolve(state, path)
                return resolver.value !== undefined
                    ? immutableState.del(resolver.path)
                    : immutableState
            })
            return this
        },

        delValue(path, value) {
            operations.push((immutableState, state) => {
                const resolver = resolve(state, path)
                const index = resolver.value.indexOf(value)
                return (index !== -1)
                    ? immutableState.del([...resolver.path, index])
                    : immutableState
            })
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
                            immutable(resolve(state, prefix).value)
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

export default actionBuilder
