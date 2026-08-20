import ee from '#sepal/ee/ee'

import {exportTableToDrive$} from '#gee/jobs/ee/batch/exportTask'

const cb = op => new Promise((res, rej) => op((r, e) => e ? rej(e) : res(r)))
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))
const DESCRIPTION = 'verify-late-cancel'
const UNSUBSCRIBE_AFTER_MS = Number(process.env.UNSUBSCRIBE_AFTER_MS || 120)

const readCredentials = async () => {
    let input = ''
    for await (const chunk of process.stdin) {
        input += chunk
        if (input.includes('\n')) {
            process.stdin.pause()
            break
        }
    }
    return JSON.parse(input.trim())
}

const operationsFor = async description => {
    const operations = await cb(c => ee.data.listOperations(50, (r, e) => c(r, e)))
    return (operations || [])
        .map(operation => ({
            name: operation.name,
            description: operation.metadata?.description,
            state: operation.metadata?.state
        }))
        .filter(operation => operation.description === description)
}

const main = async () => {
    const credentials = await readCredentials()
    if (Number(credentials.access_token_expiry_date) <= Date.now()) {
        throw new Error('Linked-user authorization is expired')
    }
    ee.data.clearAuthToken()
    ee.data.setAuthTokenRefresher(null)
    ee.data.setAuthToken(null, 'Bearer', credentials.access_token, null, null, null, false)
    await cb(c => ee.initialize(null, null, c, e => c(null, e), null, credentials.project_id))
    ee.setMaxRetries(0)

    const before = await operationsFor(DESCRIPTION)
    console.log(JSON.stringify({checkpoint: 'BEFORE', matching: before.length}))

    // Exactly the production path the panel drives, subscribed and then torn down mid-submission - the same
    // shape as a superseded HTTP request.
    const subscription = exportTableToDrive$({
        collection: ee.FeatureCollection([ee.Feature(null, {a: 1})]),
        description: DESCRIPTION,
        folder: 'sepal-verify-late-cancel',
        fileNamePrefix: DESCRIPTION,
        selectors: ['a']
    }).subscribe({
        next: value => console.log(JSON.stringify({checkpoint: 'UNEXPECTED_NEXT', value})),
        error: error => console.log(JSON.stringify({checkpoint: 'UNEXPECTED_ERROR', error: String(error)})),
        complete: () => console.log(JSON.stringify({checkpoint: 'UNEXPECTED_COMPLETE'}))
    })

    await sleep(UNSUBSCRIBE_AFTER_MS)
    console.log(JSON.stringify({checkpoint: 'UNSUBSCRIBED', afterMs: UNSUBSCRIBE_AFTER_MS}))
    subscription.unsubscribe()

    // Long enough for the submission to land, the late-cleanup path to run, and Earth Engine to settle the
    // task's state.
    await sleep(20000)
    const after = await operationsFor(DESCRIPTION)
    console.log(JSON.stringify({checkpoint: 'AFTER', operations: after}, null, 2))
    process.exit(0)
}

main().catch(error => {
    console.log(JSON.stringify({checkpoint: 'HARNESS_FAIL', error: String(error)}))
    process.exit(1)
})
