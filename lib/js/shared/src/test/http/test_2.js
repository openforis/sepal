import {EMPTY, delay} from 'rxjs'
import Job from '#sepal/worker/job'
import test_2_1 from './test_2_1.js'

const worker$ = () => {
    return EMPTY.pipe(delay(100))
}

export default Job({
    jobName: 'Test 2',
    worker$,
    before: [test_2_1],
    args: _ctx => ['2']
})
