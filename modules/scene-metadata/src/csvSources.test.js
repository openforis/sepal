import {jest} from '@jest/globals'
import {lastValueFrom, toArray} from 'rxjs'

import {configureNoLogging} from '#sepal/log'

const download = jest.fn()
const processCSV = jest.fn()
jest.unstable_mockModule('./filesystem.js', () => ({download}))
jest.unstable_mockModule('./csv.js', () => ({processCSV}))
const {downloadLandsat$, loadLandsat$} = await import('./landsatCsv.js')
const {downloadSentinel2$} = await import('./sentinel2Csv.js')

describe('CSV source subscriptions', () => {
    beforeEach(() => {
        configureNoLogging()
        jest.useFakeTimers()
        download.mockReset()
        processCSV.mockReset()
    })

    afterEach(() => jest.useRealTimers())

    test.each([
        ['Landsat', downloadLandsat$, ['landsat-tm', 'landsat-etm', 'landsat-ot']],
        ['Sentinel-2', downloadSentinel2$, ['sentinel-2']]
    ])('%s defers downloads, starts its collections together and emits success once', async (_name, download$, collections) => {
        const pending = Promise.withResolvers()
        const started = []
        download.mockImplementation(({collection}) => {
            started.push(collection)
            return pending.promise
        })

        const source$ = download$()
        expect(started).toEqual([])
        const completion = lastValueFrom(source$.pipe(toArray()))
        expect(started).toEqual(collections)
        pending.resolve()
        const emissions = await completion

        expect(emissions).toEqual([undefined])
    })

    test('Landsat drains the remaining downloads before reporting a collection failure', async () => {
        const pending = Promise.withResolvers()
        const last = Promise.withResolvers()
        const failed = Promise.withResolvers()
        const error = new Error('Download failed')
        const downloads = {'landsat-tm': failed.promise, 'landsat-etm': pending.promise, 'landsat-ot': last.promise}
        download.mockImplementation(({collection}) => downloads[collection])
        const failure = jest.fn()

        const completion = lastValueFrom(downloadLandsat$()).catch(failure)
        failed.reject(error)
        await jest.advanceTimersByTimeAsync(0)
        expect(failure).not.toHaveBeenCalled()
        pending.resolve()
        await jest.advanceTimersByTimeAsync(0)
        expect(failure).not.toHaveBeenCalled()
        last.resolve()
        await completion

        expect(failure).toHaveBeenCalledWith(error)
    })

    test('cancellation lets the active Landsat CSV operation finish without starting another collection or emitting checkpoints', async () => {
        const pending = Promise.withResolvers()
        const started = []
        const emissions = []
        processCSV.mockImplementation(({collection}) => {
            started.push(collection)
            return pending.promise
        })
        const source$ = loadLandsat$({database: {}, timestamp: new Date()})
        expect(started).toEqual([])

        const subscription = source$.subscribe(checkpoints => emissions.push(checkpoints))
        expect(started).toEqual(['landsat-tm'])
        subscription.unsubscribe()
        pending.resolve({LANDSAT_5: '2021-07-15T00:00:00.000Z'})
        await pending.promise

        expect(started).toEqual(['landsat-tm'])
        expect(emissions).toEqual([])
    })
})
