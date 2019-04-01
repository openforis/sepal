import {dispatch} from 'store'
import {resolve} from 'stateUtils'
import _ from 'lodash'
import immutable from 'object-path-immutable'

const actionBuilder = (type, props, prefix) => {
    const operations = []
    const sideEffects = []

    const scopedResolve = (state, path) =>
        resolve(state, [prefix, path])
    
    const operation = (path, func) =>
        operations.push((immutableState, state) => {
            const resolver = scopedResolve(state, path)
            const updatedValue = func(immutableState, resolver) || immutableState
            return _.isEqual(resolver.value, updatedValue) || updatedValue
        })

    return {
        set(path, value) {
            operation(path, (immutableState, resolver) =>
                immutableState.set(resolver.path, value)
            )
            return this
        },

        sort(path, key) {
            operation(path, (immutableState, resolver) =>
                immutableState.set(resolver.path, _.orderBy(resolver.value, key))
            )
            return this
        },

        unique(path) {
            operation(path, (immutableState, resolver) =>
                immutableState.set(resolver.path, _.uniq(resolver.value))
            )
            return this
        },

        assign(path, value) {
            operation(path, (immutableState, resolver) =>
                immutableState.assign(resolver.path, value)
            )
            return this
        },

        merge(path, value) {
            operation(path, (immutableState, resolver) =>
                immutableState.merge(resolver.path, value)
            )
            return this
        },

        push(path, value) {
            operation(path, (immutableState, resolver) =>
                immutableState.push(resolver.path, value)
            )
            return this
        },

        pushUnique(path, value, key) {
            operation(path, (immutableState, resolver) => {
                const finder = key
                    ? item => resolve(item, key).value === resolve(value, key).value
                    : item => item === value
                if (!resolver.value || !_.find(resolver.value, finder)) {
                    return immutableState.push(resolver.path, value)
                }
            })
            return this
        },

        del(path) {
            operation(path, (immutableState, resolver) =>
                immutableState.del(resolver.path)
            )
            return this
        },

        unshift(path, value) {
            operation(path, (immutableState, resolver) =>
                immutableState.insert(resolver.path, value, 0)
            )
            return this
        },

        setAll(values) {
            Object.keys(values).forEach(path => this.set(path, values[path]))
            return this
        },

        forEach(paths, callback) {
            _.forEach(paths, (path, key) => callback(this, path, key))
            return this
        },

        sideEffect(callback) {
            sideEffects.push(callback)
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
                    const nextState = operations.reduce(
                        performOperation,
                        immutable(state)
                    ).value()
                    sideEffects.forEach(
                        sideEffect => sideEffect(scopedResolve(nextState).value)
                    )
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
