// Translation key for the Task Details "update time" label, which reads differently per task status (the
// update time means different things: last progress while running, or when it finished/failed/was canceled).
const UPDATE_TIME_LABEL_KEY = {
    PENDING: 'tasks.details.updateTime.lastProgress',
    ACTIVE: 'tasks.details.updateTime.lastProgress',
    CANCELING: 'tasks.details.updateTime.cancelRequested',
    COMPLETED: 'tasks.details.updateTime.completed',
    FAILED: 'tasks.details.updateTime.failed',
    CANCELED: 'tasks.details.updateTime.canceled'
}

export const updateTimeLabelKey = status =>
    UPDATE_TIME_LABEL_KEY[status] || 'tasks.details.updateTime.lastUpdate'
