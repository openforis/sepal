import assert from 'node:assert/strict'
import {mkdtemp, rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {afterEach, beforeEach, mock, test} from 'node:test'
import {isDeepStrictEqual} from 'node:util'

import {of} from 'rxjs'

import {assertMatches} from '#sepal/testSupport/assert'

const events = []
let exportImpl

mock.module('../workspaceExport.js', {
    exports: {
        exportToWorkspace: args => exportImpl(args)
    }
})

mock.module('#sepal/terminal', {
    exports: {
        terminal$: (command, args, options) => {
            events.push({stack: [command, args], options})
            return of({stream: 'stdout', value: ''})
        }
    }
})

const {timeSeriesExport} = await import('./timeSeriesExport.js')

const originalHome = process.env.HOME
let home

beforeEach(async () => {
    home = await mkdtemp(join(tmpdir(), 'time-series-'))
    process.env.HOME = home
    events.length = 0
    exportImpl = async ({start, downloadDir, localProcessing: received}) => {
        await start()
        events.push({download: downloadDir, localProcessing: received})
        return {downloaded: true}
    }
})

afterEach(async () => {
    process.env.HOME = originalHome
    await rm(home, {recursive: true, force: true})
})

const params = {
    description: 'series',
    image: {recipe: {model: {dates: {startDate: '2020-01-01', endDate: '2020-02-01'}}}}
}
const RANGE = {startDate: '2020-01-01', endDate: '2020-02-01'}
const RANGE_2 = {startDate: '2020-02-01', endDate: '2020-03-01'}

test('exports each tile\'s ranges with imagery into its own directory, then stacks the tile', async () => {
    const dir = `${home}/downloads/series`
    const sepal = fakeSepal({tileIds: ['a', 'b'], ranges: {a: [RANGE], b: [RANGE, RANGE_2]}})

    await timeSeriesExport(params, context(sepal))

    assert.deepEqual(
        events.filter(({download}) => download).map(({download}) => download).sort(),
        [
            `${dir}/0/chunk-2020-01-01_2020-02-01`,
            `${dir}/1/chunk-2020-01-01_2020-02-01`,
            `${dir}/1/chunk-2020-02-01_2020-03-01`
        ]
    )
    const stacks = events.filter(({stack}) => stack)
    assert.deepEqual(stacks.map(({stack}) => stack), [
        ['sepal-stack-time-series', [`${dir}/0`]],
        ['sepal-stack-time-series', [`${dir}/1`]]
    ])
    const stackZero = events.findIndex(({stack}) => stack?.[1][0].endsWith('/0'))
    const firstOfTileOne = events.findIndex(({download}) => download?.includes('/1/'))
    assert.ok(stackZero < firstOfTileOne)
    assert.deepEqual(sepal.exported.map(({body}) => body.tileId), ['a', 'b', 'b'])
    assert.equal(sepal.exported[0].path, 'task/export/timeseries/chunk')
    assert.partialDeepStrictEqual(sepal.exported[0].body, {tileIndex: 0, ...RANGE})
})

test('reports progress per tile and chunk with the existing messages', async () => {
    const sepal = fakeSepal({tileIds: ['a', 'b'], ranges: {a: [RANGE], b: [RANGE, RANGE_2]}})
    const reports = []

    await timeSeriesExport(params, {...context(sepal), report: message => reports.push(message)})

    const keyed = reports.map(({messageKey, messageArgs}) => ({messageKey, messageArgs}))
    const missing = [
        {messageKey: 'tasks.retrieve.time_series_to_sepal.progress', messageArgs: {currentTilePercent: 50, currentTile: 2, totalTiles: 2}},
        {messageKey: 'tasks.retrieve.time_series_to_sepal.assembling', messageArgs: {currentTile: 1, totalTiles: 2}},
        {messageKey: 'tasks.retrieve.time_series_to_sepal.assembling', messageArgs: {currentTile: 2, totalTiles: 2}}
    ].filter(expected => !keyed.some(report => isDeepStrictEqual(report, expected)))
    assert.deepEqual(missing, [])
})

test('a tile without imagery is skipped, and nothing is stacked for it', async () => {
    const sepal = fakeSepal({tileIds: ['a', 'b'], ranges: {a: [], b: [RANGE]}})

    await timeSeriesExport(params, context(sepal))

    assert.deepEqual(sepal.exported.map(({body}) => body.tileId), ['b'])
    assert.deepEqual(
        events.filter(({stack}) => stack).map(({stack}) => stack[1]),
        [[`${home}/downloads/series/1`]]
    )
})

test('stacks each tile as a local processing step, and hands the chunks the same local processing', async () => {
    const sepal = fakeSepal({tileIds: ['a'], ranges: {a: [RANGE]}})

    await timeSeriesExport(params, context(sepal))

    assert.deepEqual(
        events.filter(({download}) => download).map(event => event.localProcessing),
        [localProcessing]
    )
    assertMatches(
        events.filter(event => event.stack || typeof event.localProcessing === 'string'),
        [
            {localProcessing: 'begins'},
            {stack: ['sepal-stack-time-series', [`${home}/downloads/series/0`]]},
            {localProcessing: 'ends'}
        ]
    )
})

test('the tile directory reaches the stacker as one argument, not through a shell', async () => {
    const sepal = fakeSepal({tileIds: ['a'], ranges: {a: [RANGE]}})

    await timeSeriesExport({...params, description: 'my series; touch x'}, context(sepal))

    const [stackEvent] = events.filter(({stack}) => stack)
    assert.deepEqual(
        stackEvent.stack,
        ['sepal-stack-time-series', [`${home}/downloads/my series; touch x/0`]]
    )
    assert.deepEqual(stackEvent.options, {shell: false})
})

test('one failed chunk cancels the chunks still running and fails the export', async () => {
    const aborted = []
    exportImpl = async ({start, downloadDir, signal}) => {
        await start()
        if (downloadDir.includes('2020-01-01')) {
            throw new Error('chunk failed')
        }
        await new Promise(resolve => signal.addEventListener('abort', resolve))
        aborted.push(downloadDir)
        return {downloaded: false}
    }
    const sepal = fakeSepal({tileIds: ['a'], ranges: {a: [RANGE, RANGE_2, {startDate: '2020-03-01', endDate: '2020-04-01'}]}})

    await assert.rejects(timeSeriesExport(params, context(sepal)), /chunk failed/)

    assert.equal(aborted.length, 2)
    assert.deepEqual(events.filter(({stack}) => stack), [])
})

const fakeSepal = ({tileIds, ranges}) => {
    const exported = []
    return {
        exported,
        gee: async (path, body) => {
            if (path === 'task/timeseries/tiles') {
                return {tileIds}
            }
            if (path === 'task/timeseries/chunks') {
                return {dateRanges: ranges[body.tileId]}
            }
            throw new Error(`unexpected ${path}`)
        },
        startExport: async (path, body) => {
            exported.push({path, body})
            return {eeTaskId: 'T', destination: {}}
        }
    }
}

const localProcessing = {
    run: async work => {
        events.push({localProcessing: 'begins'})
        try {
            return await work()
        } finally {
            events.push({localProcessing: 'ends'})
        }
    }
}

const context = sepal => ({sepal, report: () => {}, signal: new AbortController().signal, sleep: async () => {}, localProcessing})
