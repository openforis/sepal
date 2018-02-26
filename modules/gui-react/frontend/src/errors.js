import {dispatch} from 'store'

export const httpCallFailed = () => dispatch({
    type: 'HTTP_CALL_FAILED',
    reduce(state) {
        Object.assign({}, state, {error: 'HTTP_CALL_FAILED'})
    }
})
