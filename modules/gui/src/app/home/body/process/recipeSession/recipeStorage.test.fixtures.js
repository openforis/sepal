import {gunzipSync, strFromU8} from 'fflate'
import _ from 'lodash'
import {catchError, defer, Observable, of, switchMap, throwError} from 'rxjs'

// Recipe storage as the recipe module answers the GUI (modules/recipe/src/routes.js, recipeRepository.js), for tests
// that stand in for it.
//
// A save expecting no revision creates the recipe at revision 1, placed in the project it names; one expecting the
// revision stored updates it to the next, where it is placed. Either answers the revision it wrote. Any other is refused
// as the service refuses it, changing nothing: a recipe not stored is not found (404), one of another type is a mismatch
// (409), and one at another revision, or created already, a conflict (412) naming the revision stored.
//
// A read answers what the last save accepted - its content decompressed with the library the GUI compresses it with
// (~/gzip), or as JSON carries it where a test passes content through uncompressed - with its placement and revision
// from storage, never from its content; a recipe not stored is not found (404). Records a test seeds are stored as
// content too: without the view state (`ui`) the GUI never sends.
//
// Every save storage refuses, or cannot process (500), is kept until a test ending asks for them (checkSaves).
//
// With `answerReads: false` a read is answered only when a case says so (`answer`, `fail`); `pendingReads()` names those
// neither answered nor cancelled, and `reportPendingReads` names them beside a test that failed, so a read nothing
// answers is seen for what it is rather than as a wait elsewhere. A read pending on purpose, or cancelled, fails nothing.
export const recipeStorage = ({records = [], answerReads = true} = {}) => {
    const rows = new Map(records.map(record => [record.id, rowOf(record)]))
    const saves = []
    const reads = []
    const failures = []

    const save$ = request => defer(() => {
        saves.push(request)
        return content$(request.gzippedContents).pipe(
            switchMap(content => {
                const refusal = refusalOf(request, rows.get(request.id))
                return refusal ? throwError(() => refusal) : of({revision: write(request, content)})
            }),
            catchError(error => {
                const failure = error.name === 'AjaxError' ? error : Object.assign(httpError(500, null), {cause: error})
                failures.push({request, failure})
                failing.add(storage)
                return throwError(() => failure)
            })
        )
    })

    const write = ({id, projectId, type, expectedRevision}, content) => {
        const current = rows.get(id)
        const revision = current ? expectedRevision + 1 : 1
        rows.set(id, {type, projectId: current ? current.projectId : projectId || null, revision, content: stored(content)})
        return revision
    }

    const readBack = id => {
        const row = rows.get(id)
        return row && {..._.cloneDeep(row.content), projectId: row.projectId, revision: row.revision}
    }

    const load$ = id => answerReads
        ? defer(() => rows.has(id) ? of(readBack(id)) : throwError(() => notFound(id)))
        : new Observable(subscriber => {
            const read = {id, subscriber, settled: false, cancelled: false}
            reads.push(read)
            return () => read.cancelled = !read.settled
        })

    const settle = (id, deliver) => reads
        .filter(read => read.id === id && !read.settled && !read.cancelled)
        .forEach(read => {
            read.settled = true
            deliver(read.subscriber)
        })

    const pendingReads = () =>
        reads.filter(({settled, cancelled}) => !settled && !cancelled).map(({id}) => id)

    const storage = {
        save$,
        load$,
        saves,
        // What a read of the recipe answers now.
        stored: readBack,
        // Stores a record as it is now, as another session or a test arranging storage would.
        store: record => rows.set(record.id, rowOf(record)),
        answer: (id, record = readBack(id)) => settle(id, subscriber => {
            subscriber.next(record)
            subscriber.complete()
        }),
        fail: (id, error = notFound(id)) => settle(id, subscriber => subscriber.error(error)),
        reads: () => reads.map(({id}) => id),
        pendingReads,
        // Given the context of a test ending, before its teardown cancels what is still read: from an afterEach registered
        // after the teardown's, as hooks after a test run in reverse.
        reportPendingReads: ({task}) => {
            const pending = pendingReads()
            if (task.result?.state === 'fail' && pending.length) {
                console.error(`Recipe storage reads still unanswered when the test failed: ${pending.join(', ')}`)
            }
        },
        takeFailures: () => {
            failing.delete(storage)
            return failures.splice(0)
        }
    }
    return storage
}

// Fails, as a test ends, for every save a storage fake refused or could not process that nothing has taken yet, naming
// the recipe, the revision the save expected and what storage answered - so that a test does not pass while its session
// recovers from a failed save unseen. A save storage never received - still being compressed, or cancelled - failed
// nothing. The session fixtures ask once a test's sessions are disposed (disposeInstalledSessions).
export const checkSaves = () => {
    const failed = [...failing].flatMap(storage => storage.takeFailures())
    if (failed.length) {
        throw new Error([`Recipe storage failed ${failed.length} save(s) this test made:`, ...failed.map(describeFailure)].join('\n'))
    }
}

// The fakes holding failures not taken yet: a fake is held from its first such failure until they are taken, so what a
// check visits, and what is kept for it, is only what it has to report.
const failing = new Set()

const describeFailure = ({request: {id, expectedRevision}, failure: {status, response, cause}}) => [
    `  ${id}, expecting ${expectedRevision == null ? 'no revision (creating it)' : `revision ${expectedRevision}`}: ${status}`,
    response?.code,
    response?.currentRevision != null && `(stored at revision ${response.currentRevision})`,
    cause && `- ${cause.message}`
].filter(Boolean).join(' ')

const rowOf = ({projectId = null, revision = 1, ...record}) =>
    ({type: record.type, projectId, revision, content: stored(_.omit(record, 'ui'))})

// What the service keeps of a document: JSON, without the placement and revision storage owns.
const stored = content =>
    _.omit(JSON.parse(JSON.stringify(content)), ['projectId', 'revision'])

// The document a save sends, which the service stores only as a JSON object.
const content$ = contents => defer(() => {
    const content = ArrayBuffer.isView(contents) ? JSON.parse(strFromU8(gunzipSync(contents))) : contents
    if (!content || typeof content !== 'object' || Array.isArray(content)) {
        throw new Error('A recipe must be a JSON object')
    }
    return of(content)
})

const refusalOf = ({id, type, expectedRevision}, current) => {
    if (expectedRevision != null && !(Number.isSafeInteger(expectedRevision) && expectedRevision > 0)) {
        return httpError(400, {code: 'INVALID_EXPECTED_REVISION'})
    }
    if (expectedRevision == null ? !current : current?.type === type && current.revision === expectedRevision) {
        return null
    }
    if (!current) {
        return notFound(id)
    }
    return current.type === type
        ? httpError(412, {code: 'RECIPE_REVISION_CONFLICT', currentRevision: current.revision})
        : httpError(409, {code: 'RECIPE_TYPE_MISMATCH'})
}

const notFound = id =>
    Object.assign(httpError(404, null), {message: `No such recipe: ${id}`})

// As the GUI's HTTP client fails a request (rxjs/ajax): the status, and the body the service answered with.
const httpError = (status, response) =>
    Object.assign(new Error(`ajax error ${status}`), {name: 'AjaxError', status, response})
