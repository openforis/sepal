import {jest} from '@jest/globals'
import {mkdtemp, rm} from 'fs/promises'
import {tmpdir} from 'os'
import {join} from 'path'
import {of} from 'rxjs'

const events = []
let exportImpl

jest.unstable_mockModule('../workspaceExport.js', () => ({
    exportToWorkspace: args => exportImpl(args)
}))

jest.unstable_mockModule('#sepal/terminal', () => ({
    terminal$: (command, args, options) => {
        events.push({stack: [command, args], options})
        return of({stream: 'stdout', value: ''})
    }
}))

const {timeSeriesExport} = await import('./timeSeriesExport.js')

const originalHome = process.env.HOME
let home

beforeEach(async () => {
    home = await mkdtemp(join(tmpdir(), 'time-series-'))
    process.env.HOME = home
    events.length = 0
    exportImpl = async ({start, downloadDir}) => {
        await start()
        events.push({download: downloadDir})
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

    expect(events.filter(({download}) => download).map(({download}) => download).sort()).toEqual([
        `${dir}/0/chunk-2020-01-01_2020-02-01`,
        `${dir}/1/chunk-2020-01-01_2020-02-01`,
        `${dir}/1/chunk-2020-02-01_2020-03-01`
    ])
    const stacks = events.filter(({stack}) => stack)
    expect(stacks.map(({stack}) => stack)).toEqual([
        ['sepal-stack-time-series', [`${dir}/0`]],
        ['sepal-stack-time-series', [`${dir}/1`]]
    ])
    const stackZero = events.findIndex(({stack}) => stack?.[1][0].endsWith('/0'))
    const firstOfTileOne = events.findIndex(({download}) => download?.includes('/1/'))
    expect(stackZero).toBeLessThan(firstOfTileOne)
    expect(sepal.exported.map(({body}) => body.tileId)).toEqual(['a', 'b', 'b'])
    expect(sepal.exported[0].path).toBe('task/export/timeseries/chunk')
    expect(sepal.exported[0].body).toMatchObject({tileIndex: 0, ...RANGE})
})

test('reports progress per tile and chunk with the existing messages', async () => {
    const sepal = fakeSepal({tileIds: ['a', 'b'], ranges: {a: [RANGE], b: [RANGE, RANGE_2]}})
    const reports = []

    await timeSeriesExport(params, {...context(sepal), report: message => reports.push(message)})

    expect(reports.map(({messageKey, messageArgs}) => ({messageKey, messageArgs}))).toEqual(expect.arrayContaining([
        {messageKey: 'tasks.retrieve.time_series_to_sepal.progress', messageArgs: {currentTilePercent: 50, currentTile: 2, totalTiles: 2}},
        {messageKey: 'tasks.retrieve.time_series_to_sepal.assembling', messageArgs: {currentTile: 1, totalTiles: 2}},
        {messageKey: 'tasks.retrieve.time_series_to_sepal.assembling', messageArgs: {currentTile: 2, totalTiles: 2}}
    ]))
})

test('a tile without imagery is skipped, and nothing is stacked for it', async () => {
    const sepal = fakeSepal({tileIds: ['a', 'b'], ranges: {a: [], b: [RANGE]}})

    await timeSeriesExport(params, context(sepal))

    expect(sepal.exported.map(({body}) => body.tileId)).toEqual(['b'])
    expect(events.filter(({stack}) => stack).map(({stack}) => stack[1])).toEqual([[`${home}/downloads/series/1`]])
})

test('the tile directory reaches the stacker as one argument, not through a shell', async () => {
    const sepal = fakeSepal({tileIds: ['a'], ranges: {a: [RANGE]}})

    await timeSeriesExport({...params, description: 'my series; touch x'}, context(sepal))

    const [stackEvent] = events.filter(({stack}) => stack)
    expect(stackEvent.stack).toEqual(['sepal-stack-time-series', [`${home}/downloads/my series; touch x/0`]])
    expect(stackEvent.options).toEqual({shell: false})
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

    await expect(timeSeriesExport(params, context(sepal))).rejects.toThrow('chunk failed')

    expect(aborted.length).toBe(2)
    expect(events.filter(({stack}) => stack)).toEqual([])
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

const context = sepal => ({sepal, report: () => {}, signal: new AbortController().signal, sleep: async () => {}})
