import {Mutator} from 'stateUtils'
import {dispatch} from 'store'
import _ from 'lodash'

const actionBuilder = (type, props, prefix) => {
    const operations = []
    const sideEffects = []

    const addOperation = (path, func) =>
        operations.push(
            state => func(new Mutator(state, [prefix, path]))
        )

    const applyOperations = state =>
        operations.reduce(
            (state, operation) => operation(state),
            state || {}
        )

    const applySideEffects = state =>
        sideEffects.forEach(
            sideEffect => sideEffect(state)
        )

    return {
        set(path, value) {
            addOperation(path, mutator => mutator.set(value))
            return this
        },

        assign(path, value) {
            addOperation(path, mutator => mutator.assign(value))
            return this
        },

        merge(path, value) {
            addOperation(path, mutator => mutator.merge(value))
            return this
        },

        push(path, value) {
            addOperation(path, mutator => mutator.push(value))
            return this
        },

        pushUnique(path, value, key) {
            addOperation(path, mutator => mutator.pushUnique(value, key))
            return this
        },

        del(path) {
            addOperation(path, mutator => mutator.del())
            return this
        },

        sort(path, key) {
            addOperation(path, mutator => mutator.sort(key))
            return this
        },

        unique(path) {
            addOperation(path, mutator => mutator.unique())
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
            return {
                type,
                ...props,
                reduce(state = {}) {
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
