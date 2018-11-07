import {dispatch} from 'store'
import _ from 'lodash'
import immutable from 'object-path-immutable'

const dotSafeWrap = path => ({dotSafe: path})
const dotSafeUnwrap = safePath => safePath.dotSafe

const toPathList = (path, safe = false) => {
    if (_.isArray(path)) {
        return _.flatten(path.map(pathElement => toPathList(pathElement, safe)))
    }
    if (_.isObject(path)) {
        return toPathList(dotSafeUnwrap(path), true)
    }
    if (_.isString(path)) {
        return safe ? path : path.split('.')
    }
    throw new Error('Unsupported path element type: ', path)
}

const select = (path, state) => {
    const pathList = toPathList(path)
    return pathList.reduce((state, part) => {
        return state != null && state[part] != null ? state[part] : undefined
    }, state)

}

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
                const prevValue = select(path, state)
                return callback(prevValue, immutableState)
            })
            return this
        },

        set(path, value) {
            operations.push((immutableState, state) => {
                const prevValue = select(path, state)
                if (prevValue !== value)
                    return immutableState.set(toPathList(path), value)
            })
            return this
        },

        setValueByTemplate(path, template, value) {
            operations.push((immutableState, state) => {
                const index = select(path, state)
                    .findIndex(value => _.isEqual(_.merge({}, value, template), value))
                return (index !== -1)
                    ? immutableState.set([...toPathList(path), index], value)
                    : immutableState
            })
            return this
        },

        assign(path, value) {
            operations.push(immutableState =>
                immutableState.assign(toPathList(path), value)
            )
            return this
        },

        assignValueByTemplate(path, template, value) {
            operations.push((immutableState, state) => {
                const index = select(path, state)
                    .findIndex(value => _.isEqual(_.merge({}, value, template), value))
                return (index !== -1)
                    ? immutableState.assign([...toPathList(path), index], value)
                    : immutableState
            })
            return this
        },

        merge(path, value) {
            operations.push(immutableState =>
                immutableState.merge(toPathList(path), value)
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
                const collection = select(path, state)
                if (!Array.isArray(collection)) return immutableState
                return collection
                    .map(callback)
                    .map((value, index) => ({index, value}))
                    .filter(({index, value}) => value !== collection[index])
                    .reduce((immutableState, {index, value}) => immutableState.set([toPathList(path), index], value), immutableState)
            })
            return this
        },

        push(path, value) {
            operations.push(immutableState => {
                return immutableState.push(toPathList(path), value)
            })
            return this
        },

        sideEffect(callback) {
            sideEffects.push(callback)
            return this
        },

        pushIfMissing(path, value, uniqueKeyProp) {
            operations.push((immutableState, state) => {
                const collection = select(path, state)
                const equals = item => uniqueKeyProp
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
            operations.push(immutableState => immutableState.del(toPathList(path)))
            return this
        },

        delValue(path, value) {
            operations.push((immutableState, state) => {
                const index = select(path, state).indexOf(value)
                return (index !== -1)
                    ? immutableState.del([...toPathList(path), index])
                    : immutableState
            })
            return this
        },

        delValueByTemplate(path, template) {
            operations.push((immutableState, state) => {
                const index = select(path, state)
                    .findIndex(value => _.isEqual(_.merge({}, value, template), value))
                return (index !== -1)
                    ? immutableState.del([...toPathList(path), index])
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

export default actionBuilder
export const dotSafe = path => dotSafeWrap(path)
