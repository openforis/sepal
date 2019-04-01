import {dispatch} from 'store'
import {resolve} from 'stateUtils'
import _ from 'lodash'
import immutable from 'object-path-immutable'

const actionBuilder = (type, props, prefix) => {
    const operations = []
    const sideEffects = []

    const scopedResolve = (state, path) => resolve(state, [prefix, path])

    return {
        forEach(paths, callback) {
            _.forEach(paths, (path, key) => callback(this, path, key))
            return this
        },

        set(path, value) {
            operations.push((immutableState, state) => {
                const resolver = scopedResolve(state, path)
                const prevValue = resolver.value
                if (prevValue !== value)
                    return immutableState.set(resolver.path, value)
            })
            return this
        },

        sort(path, key) {
            operations.push((immutableState, state) => {
                const resolver = scopedResolve(state, path)
                return immutableState.set(resolver.path, _.orderBy(resolver.value, key))
            })
            return this
        },

        assign(path, value) {
            operations.push((immutableState, state) =>
                immutableState.assign(scopedResolve(state, path).path, value)
            )
            return this
        },

        merge(path, value) {
            operations.push((immutableState, state) =>
                immutableState.merge(scopedResolve(state, path).path, value)
            )
            return this
        },

        setAll(values) {
            Object.keys(values).forEach(path =>
                this.set(path, values[path]))
            return this
        },

        push(path, value) {
            operations.push((immutableState, state) => {
                return immutableState.push(scopedResolve(state, path).path, value)
            })
            return this
        },

        unshift(path, value) {
            operations.push((immutableState, state) => {
                return immutableState.insert(scopedResolve(state, path).path, value, 0)
            })
            return this
        },

        sideEffect(callback) {
            sideEffects.push(callback)
            return this
        },

        pushIfMissing(path, value, uniqueKeyProp) {
            operations.push((immutableState, state) => {
                const resolver = scopedResolve(state, path)
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
                const resolver = scopedResolve(state, path)
                return resolver.value !== undefined
                    ? immutableState.del(resolver.path)
                    : immutableState
            })
            return this
        },

        delValue(path, value) {
            operations.push((immutableState, state) => {
                const resolver = scopedResolve(state, path)
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
                    var nextState = operations.reduce(
                        performOperation,
                        immutable(state)
                    ).value()
                    sideEffects.forEach(sideEffect => sideEffect(scopedResolve(nextState).value))
                    return nextState
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

export const scopedActionBuilder = prefix =>
    (type, props) => actionBuilder(type, props, prefix)
