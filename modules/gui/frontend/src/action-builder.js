import {Foo} from 'stateUtils'
import {dispatch} from 'store'
import _ from 'lodash'

const actionBuilder = (type, props, prefix) => {
    const operations = []
    const sideEffects = []

    const scopedResolve = (state, path) =>
        new Foo(state, [prefix, path])
    
    const operation = (path, func) =>
        operations.push(state => {
            const foo = scopedResolve(state, path)
            const updatedValue = func(foo)
            return updatedValue
            // return _.isEqual(foo.value, updatedValue) || updatedValue
        })

    return {
        set(path, value) {
            operation(path, foo => foo.set(value))
            return this
        },

        sort(path, key) {
            operation(path, foo => foo.sort(key))
            return this
        },

        unique(path) {
            operation(path, foo => foo.unique())
            return this
        },

        assign(path, value) {
            operation(path, foo => foo.assign(value))
            return this
        },

        merge(path, value) {
            operation(path, foo => foo.merge(value))
            return this
        },

        push(path, value) {
            operation(path, foo => foo.push(value))
            return this
        },

        pushUnique(path, value, key) {
            operation(path, foo => foo.pushUnique(value, key))
            return this
        },

        del(path) {
            operation(path, foo => foo.del())
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
            const performOperation = (state, operation) => operation(state)
            return {
                type,
                ...props,
                reduce(state) {
                    const nextState = operations.reduce(
                        performOperation,
                        state || {}
                    )
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
