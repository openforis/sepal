// Task fields the task list keeps live in Redux. An open Task Details panel loads the full task once, then
// overlays these live fields so status/progress follow along without refetching.
const LIVE_FIELDS = ['status', 'statusDescription', 'updateTime']

// Merge the once-loaded detail task with the live Redux task: keep all loaded fields (params/config/
// location/name/description/creationTime), overriding only the live fields when present. Returns the loaded
// task unchanged when there's no live task (and null/undefined when nothing is loaded yet).
export const mergeTask = (task, liveTask) => {
    if (!task || !liveTask) {
        return task
    }
    const merged = {...task}
    LIVE_FIELDS.forEach(field => {
        if (liveTask[field] !== undefined) {
            merged[field] = liveTask[field]
        }
    })
    return merged
}

const RUNNING_STATUSES = ['ACTIVE', 'PENDING', 'CANCELING']

export const isTaskRunning = task => RUNNING_STATUSES.includes(task?.status)
