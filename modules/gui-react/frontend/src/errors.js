import actionRegistry from 'action-registry'

export const httpCallFailed = actionRegistry.register(
    'HTTP_CALL_FAILED',
    (state, action) => Object.assign({}, state, {error: 'HTTP_CALL_FAILED'})
)
