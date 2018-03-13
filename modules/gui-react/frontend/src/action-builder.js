import immutable from 'object-path-immutable'
import {dispatch} from 'store'

export default function actionBuilder(type, props = {}) {
    const operations = []
    return {
        set(path, value) {
            operations.push((immutableState) => immutableState.set(path, value))
            return this
        },

        push(path, value) {
            operations.push((immutableState) => immutableState.push(path, value))
            return this
        },

        del(path) {
            operations.push((immutableState) => immutableState.del(path))
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
                    return operations.reduce(
                        (immutableState, operation) => operation(immutableState),
                        immutable(state)
                    ).value()
                }
            }
        },

        dispatch() {
            dispatch(this.build())
        }
    }
}