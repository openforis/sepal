import assert from 'node:assert/strict'
import {afterEach, beforeEach, describe, mock, test} from 'node:test'

import {lastValueFrom, toArray} from 'rxjs'

import {configureNoLogging} from '#sepal/log'
import {callsOf} from '#sepal/testSupport/mock'

const download = mock.fn()
const processCSV = mock.fn()
mock.module('./filesystem.js', {
    exports: {
        download
    }
})
mock.module('./csv.js', {
    exports: {
        processCSV
    }
})
const {downloadLandsat$, loadLandsat$} = await import('./landsatCsv.js')
const {downloadSentinel2$} = await import('./sentinel2Csv.js')

describe('CSV source subscriptions', () => {
    beforeEach(() => {
        configureNoLogging()
        mock.timers.enable({apis: ['setTimeout', 'setInterval', 'Date']})
        download.mock.resetCalls()
        download.mock.mockImplementation(() => undefined)
        processCSV.mock.resetCalls()
        processCSV.mock.mockImplementation(() => undefined)
    })

    afterEach(() => mock.timers.reset())

    for (const [name, download$, collections] of [
        ['Landsat', downloadLandsat$, ['landsat-tm', 'landsat-etm', 'landsat-ot']],
        ['Sentinel-2', downloadSentinel2$, ['sentinel-2']]
    ]) {
        test(
            `${name} defers downloads, starts its collections together and emits success once`,
            async () => {
                const pending = Promise.withResolvers()
                const started = []
                download.mock.mockImplementation(({collection}) => {
                    started.push(collection)
                    return pending.promise
                })

                const source$ = download$()
                assert.deepEqual(started, [])
                const completion = lastValueFrom(source$.pipe(toArray()))
                assert.deepEqual(started, collections)
                pending.resolve()
                const emissions = await completion

                assert.deepEqual(emissions, [undefined])
            }
        )
    }

    test('Landsat drains the remaining downloads before reporting a collection failure', async () => {
        const pending = Promise.withResolvers()
        const last = Promise.withResolvers()
        const failed = Promise.withResolvers()
        const error = new Error('Download failed')
        const downloads = {'landsat-tm': failed.promise, 'landsat-etm': pending.promise, 'landsat-ot': last.promise}
        download.mock.mockImplementation(({collection}) => downloads[collection])
        const failure = mock.fn()

        const completion = lastValueFrom(downloadLandsat$()).catch(failure)
        failed.reject(error)
        await settle()
        assert.equal(failure.mock.callCount(), 0)
        pending.resolve()
        await settle()
        assert.equal(failure.mock.callCount(), 0)
        last.resolve()
        await completion

        assert.deepEqual(callsOf(failure), [[error]])
    })

    test('cancellation lets the active Landsat CSV operation finish without starting another collection or emitting checkpoints', async () => {
        const pending = Promise.withResolvers()
        const started = []
        const emissions = []
        processCSV.mock.mockImplementation(({collection}) => {
            started.push(collection)
            return pending.promise
        })
        const source$ = loadLandsat$({database: {}, timestamp: new Date()})
        assert.deepEqual(started, [])

        const subscription = source$.subscribe(checkpoints => emissions.push(checkpoints))
        assert.deepEqual(started, ['landsat-tm'])
        subscription.unsubscribe()
        pending.resolve({LANDSAT_5: '2021-07-15T00:00:00.000Z'})
        await pending.promise

        assert.deepEqual(started, ['landsat-tm'])
        assert.deepEqual(emissions, [])
    })
})

const settle = () => new Promise(resolve => setImmediate(resolve))
