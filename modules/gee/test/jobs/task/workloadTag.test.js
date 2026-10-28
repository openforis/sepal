import assert from 'node:assert/strict'
import {test} from 'node:test'

import {taskWorkloadTag} from '#gee/jobs/task/workloadTag'

test('a task\'s workload tag names its recipe type, as Earth Engine accepts it', () => {
    assert.equal(taskWorkloadTag({type: 'MOSAIC'}), 'sepal-task-mosaic')
    assert.equal(taskWorkloadTag({type: 'CHANGE.ALERTS'}), 'sepal-task-change_alerts')
})
