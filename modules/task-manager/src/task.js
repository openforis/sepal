const describe = map => JSON.stringify(map)

export const State = Object.freeze({
    PENDING: 'PENDING',
    ACTIVE: 'ACTIVE',
    CANCELING: 'CANCELING',
    COMPLETED: 'COMPLETED',
    CANCELED: 'CANCELED',
    FAILED: 'FAILED'
})

export const RUNNING_STATES = [State.ACTIVE, State.CANCELING]

// The GUI renders statusDescription as msg(messageKey, messageArgs, defaultMessage).
export const StateDescription = Object.freeze({
    PENDING: describe({defaultMessage: 'Initializing...', messageKey: 'tasks.status.initializing', messageArgs: {}}),
    ACTIVE: describe({defaultMessage: 'Executing...', messageKey: 'tasks.status.executing', messageArgs: {}}),
    CANCELING: describe({defaultMessage: 'Canceling.', messageKey: 'tasks.status.canceling', messageArgs: {}}),
    COMPLETED: describe({defaultMessage: 'Completed!', messageKey: 'tasks.status.completed', messageArgs: {}}),
    CANCELED: describe({defaultMessage: 'Canceled.', messageKey: 'tasks.status.canceled', messageArgs: {}}),
    FAILED: describe({defaultMessage: 'Failed: Internal Error', messageKey: 'tasks.status.failed', messageArgs: {error: 'Internal Error'}})
})

export const failure = message =>
    describe({defaultMessage: `Failed: ${message}`, messageKey: 'tasks.status.failed', messageArgs: {error: message}})

export const statusDescriptionOf = map => describe(map)

export const createTask = ({
    id,
    state,
    username,
    operation,
    params = {},
    statusDescription = null,
    recipeId = null,
    creationTime = null,
    updateTime = null,
    progressTime = null
}) => Object.freeze({
    id,
    state,
    username,
    operation,
    params,
    statusDescription: statusDescription || StateDescription[state],
    recipeId,
    creationTime,
    updateTime,
    progressTime
})

export const isFinished = task =>
    [State.COMPLETED, State.CANCELED, State.FAILED].includes(task.state)

export const getTitle = task =>
    task.params?.title ?? task.operation
