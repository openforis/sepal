import {defer, Observable, of, throwError} from 'rxjs'

// Recipe storage as the recipe module answers the GUI (modules/recipe/src/recipeRepository.js, routes.js), for tests
// that stand in for it.
//
// A save expecting no revision creates the recipe at revision 1; one expecting the revision stored updates it to the
// next; any other is refused as a conflict (412), changing nothing. What a save sends is kept as the stored content only
// where it is sent uncompressed (a test replacing ~/gzip): compressed, the content stored stays as it was.
//
// A read answers the record stored, or fails as not found. With `answerReads: false` it is answered only when a case
// says so (`answer`, `fail`); `pendingReads()` names those neither answered nor cancelled, and `reportPendingReads`
// names them beside a test that failed, so a read nothing answers is seen for what it is rather than as a wait
// elsewhere. A read pending on purpose, or cancelled, fails nothing.
export const recipeStorage = ({records = [], answerReads = true} = {}) => {
    const stored = new Map(records.map(record => [record.id, record]))
    const saves = []
    const reads = []

    const save$ = request => defer(() => {
        saves.push(request)
        const current = stored.get(request.id)
        const expected = request.expectedRevision ?? null
        if (expected === null ? current : current?.revision !== expected) {
            return throwError(() => Object.assign(new Error(`Recipe ${request.id} is not at revision ${expected}`), {
                status: 412, response: {code: 'RECIPE_REVISION_CONFLICT', currentRevision: current?.revision}
            }))
        }
        const revision = expected === null ? 1 : expected + 1
        const content = isRecipe(request.gzippedContents) ? request.gzippedContents : current
        stored.set(request.id, {...content, id: request.id, revision})
        return of({revision})
    })

    const load$ = id => answerReads
        ? defer(() => stored.has(id) ? of(stored.get(id)) : throwError(() => notFound(id)))
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

    return {
        save$,
        load$,
        saves,
        stored: id => stored.get(id),
        // Stores a record as it is now, as another session or a test arranging storage would.
        store: record => stored.set(record.id, record),
        answer: (id, record = stored.get(id)) => settle(id, subscriber => {
            subscriber.next(record)
            subscriber.complete()
        }),
        fail: (id, error = notFound(id)) => settle(id, subscriber => subscriber.error(error)),
        reads: () => reads.map(({id}) => id),
        pendingReads: () => reads.filter(({settled, cancelled}) => !settled && !cancelled).map(({id}) => id),
        // Given the context of a test ending, before its teardown cancels what is still read: from an afterEach registered
        // after the teardown's, as hooks after a test run in reverse.
        reportPendingReads: ({task}) => {
            const pending = reads.filter(({settled, cancelled}) => !settled && !cancelled).map(({id}) => id)
            if (task.result?.state === 'fail' && pending.length) {
                console.error(`Recipe storage reads still unanswered when the test failed: ${pending.join(', ')}`)
            }
        }
    }
}

const isRecipe = content => Boolean(content) && typeof content === 'object' && !ArrayBuffer.isView(content)

const notFound = id => Object.assign(new Error(`No such recipe: ${id}`), {status: 404, statusCode: 404})
