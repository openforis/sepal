// Task domain — state machine, State enum, default i18n descriptions, transitions and timeouts.
//
// Tasks are immutable: the mutators (activate/complete/canceling/canceled/fail/update) return
// NEW objects.
//
// Shape (mirrors the persisted columns):
//   id                — task id
//   state             — PENDING | ACTIVE | COMPLETED | CANCELING | CANCELED | FAILED
//   username          — owner
//   sessionId         — worker session the task runs in
//   operation         — operation name
//   params            — operation params (Map)
//   statusDescription — JSON string of the i18n status map (defaults to state.description)
//   creationTime      — Date
//   updateTime        — Date
//   removed           — soft-delete flag
//   recipeId          — recipe id (nullable)

// Each state carries a `description`: a JSON string of its i18n map.

const stateDescription = map => JSON.stringify(map)

const State = Object.freeze({
    PENDING: 'PENDING',
    ACTIVE: 'ACTIVE',
    COMPLETED: 'COMPLETED',
    CANCELING: 'CANCELING',
    CANCELED: 'CANCELED',
    FAILED: 'FAILED',
})

// Default i18n descriptions per state. FAILED carries messageArgs.error = 'Internal Error'.
const StateDescription = Object.freeze({
    PENDING: stateDescription({defaultMessage: 'Initializing...', messageKey: 'tasks.status.initializing', messageArgs: {}}),
    ACTIVE: stateDescription({defaultMessage: 'Executing...', messageKey: 'tasks.status.executing', messageArgs: {}}),
    COMPLETED: stateDescription({defaultMessage: 'Completed!', messageKey: 'tasks.status.completed', messageArgs: {}}),
    CANCELING: stateDescription({defaultMessage: 'Canceling.', messageKey: 'tasks.status.canceling', messageArgs: {}}),
    CANCELED: stateDescription({defaultMessage: 'Canceled.', messageKey: 'tasks.status.canceled', messageArgs: {}}),
    FAILED: stateDescription({defaultMessage: 'Failed: Internal Error', messageKey: 'tasks.status.failed', messageArgs: {error: 'Internal Error'}}),
})

const createTask = ({
    id,
    state,
    username,
    sessionId,
    operation,
    params = {},
    statusDescription = null,
    creationTime = null,
    updateTime = null,
    removed = false,
    recipeId = null,
}) => Object.freeze({
    id,
    state,
    username,
    sessionId,
    operation,
    params,
    statusDescription,
    creationTime,
    updateTime,
    removed,
    recipeId,
})

const isPending = task => task.state === State.PENDING
const isActive = task => task.state === State.ACTIVE
const isCompleted = task => task.state === State.COMPLETED
const isCanceling = task => task.state === State.CANCELING
const isCanceled = task => task.state === State.CANCELED
const isFailed = task => task.state === State.FAILED

// Mutators return NEW frozen tasks. update(task, state, statusDescription?) defaults
// statusDescription to the state's own description. An EMPTY description falls back too: it
// would render as a blank status in the GUI, which parses this field as the i18n message JSON.

const update = (task, state, statusDescription = null) => createTask({
    ...task,
    state,
    statusDescription: statusDescription || StateDescription[state],
})

const activate = task => update(task, State.ACTIVE)

const complete = task => update(task, State.COMPLETED)

const canceling = task => update(task, State.CANCELING)

const canceled = task => update(task, State.CANCELED)

const fail = (task, statusDescription = StateDescription.FAILED) =>
    update(task, State.FAILED, statusDescription)

const getTitle = task => {
    switch (task.operation) {
        case 'landsat-scene-download':
            return `Retrieving ${task.params?.sceneIds?.length} Landsat scenes`
        default:
            return task.params?.title ?? task.operation
    }
}

// Timeouts: PENDING 10min, ACTIVE 5min, CANCELING 2min.
//   get(now)              = now − timeout
//   lastValidUpdate(date) = date − timeout (the oldest update_time still "fresh")
//   willTimeout(date)     = date + timeout + 1ms

const MINUTE_MS = 60 * 1000

const makeTimeout = timeoutInMillis => Object.freeze({
    timeoutInMillis,
    get: now => new Date(now.getTime() - timeoutInMillis),
    lastValidUpdate: date => new Date(date.getTime() - timeoutInMillis),
    willTimeout: date => new Date(date.getTime() + timeoutInMillis + 1),
})

const Timeout = Object.freeze({
    PENDING: makeTimeout(10 * MINUTE_MS),
    ACTIVE: makeTimeout(5 * MINUTE_MS),
    CANCELING: makeTimeout(2 * MINUTE_MS),
})

export {
    activate,
    canceled,
    canceling,
    complete,
    createTask,
    fail,
    getTitle,
    isActive,
    isCanceled,
    isCanceling,
    isCompleted,
    isFailed,
    isPending,
    State,
    StateDescription,
    Timeout,
    update,
}
