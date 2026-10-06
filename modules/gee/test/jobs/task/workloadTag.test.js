import {taskWorkloadTag} from '#gee/jobs/task/workloadTag'

test('a task\'s workload tag names its recipe type, as Earth Engine accepts it', () => {
    expect(taskWorkloadTag({type: 'MOSAIC'})).toBe('sepal-task-mosaic')
    expect(taskWorkloadTag({type: 'CHANGE.ALERTS'})).toBe('sepal-task-change_alerts')
})
