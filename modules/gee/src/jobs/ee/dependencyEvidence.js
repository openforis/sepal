import {job} from '#gee/jobs/job'
import {fileName} from '#sepal/path'

import {dependencyEvidence$} from '../dependencyEvidence.js'

// What a declared dependency's question reads now (dependencyEvidence.js), for a consumer comparing a persisted result
// with it. Reads recipes and asset metadata; evaluates nothing.
const worker$ = ({requestArgs: {dependency, question}}) =>
    dependencyEvidence$(dependency, question)

export default job({
    jobName: 'Dependency evidence',
    jobPath: fileName(import.meta.url),
    worker$
})
