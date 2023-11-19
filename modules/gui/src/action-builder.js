import {Mutator, resolve} from 'stateUtils'
import {dispatch} from 'store'
import {isEqual} from 'hash'
import _ from 'lodash'

const actionBuilder = (type, props, prefix) => {
    const operations = []
    const sideEffects = []

    const addOperation = (path, func, apply = true) =>
        apply && operations.push(
            state => func(new Mutator(state, [prefix, path]))
        )

    const applyOperations = state =>
        operations.reduce(
            (state, operation) => operation(state),
            state || {}
        )

    const applySideEffects = state =>
        sideEffects.forEach(
            sideEffect => sideEffect(resolve(state, prefix || ''))
        )

    return {
        set(path, value, apply) {
            addOperation(path, mutator => mutator.set(value), apply)
            return this
        },

        setIfChanged(path, value, apply) {
            addOperation(path, mutator => mutator.setIfChanged(value), apply)
            return this
        },

        assign(path, value, apply) {
            addOperation(path, mutator => mutator.assign(value), apply)
            return this
        },

        merge(path, value, apply) {
            addOperation(path, mutator => mutator.merge(value), apply)
            return this
        },

        push(path, value, apply) {
            addOperation(path, mutator => mutator.push(value), apply)
            return this
        },

        pushUnique(path, value, key, apply) {
            addOperation(path, mutator => mutator.pushUnique(value, key), apply)
            return this
        },

        del(path, apply) {
            addOperation(path, mutator => mutator.del(), apply)
            return this
        },

        sort(path, key, apply) {
            addOperation(path, mutator => mutator.sort(key), apply)
            return this
        },

        unique(path, apply) {
            addOperation(path, mutator => mutator.unique(), apply)
            return this
        },

        setAll(values, apply) {
            Object.keys(values).forEach(path => this.set(path, values[path], apply))
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
            return {
                type,
                ...props,
                reduce(state = {
                    state: {},
                    hash: {}
                }) {
                    const updatedState = applyOperations(state)
                    applySideEffects(updatedState)
                    return updatedState
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
