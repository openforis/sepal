import {delay, EMPTY} from 'rxjs'

import Job from '#sepal/worker/job'

const worker$ = () => {
    return EMPTY.pipe(delay(100))
}

export default Job({
    jobName: 'Test 2.1',
    before: [],
    args: _ctx => ['2.1'],
    worker$
})
