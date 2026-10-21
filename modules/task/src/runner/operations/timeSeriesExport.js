import {mkdir} from 'node:fs/promises'
import {join} from 'node:path'

import {lastValueFrom, tap} from 'rxjs'

import {getLogger} from '#sepal/log'
import {terminal$} from '#sepal/terminal'

import {chunkDateRanges} from '../dateRanges.js'
import {forEachInParallel} from '../parallel.js'
import {exportToWorkspace} from '../workspaceExport.js'

const log = getLogger('timeSeriesExport')

const CONCURRENT_CHUNKS = 3

export const timeSeriesExport = async (params, {sepal, report, signal, sleep, localProcessing}) => {
    const {description, image: {workspacePath, recipe, indicators, additionalOutputs}} = params
    const downloadDir = workspacePath ? join(process.env.HOME, workspacePath) : join(process.env.HOME, 'downloads', description)
    await mkdir(downloadDir, {recursive: true})
    const {tileIds} = await sepal.gee('task/timeseries/tiles', params)
    const totalTiles = tileIds.length
    for (const [tileIndex, tileId] of tileIds.entries()) {
        if (signal.aborted) {
            return
        }
        const {dateRanges} = await sepal.gee('task/timeseries/chunks', {...params, tileId, dateRanges: chunkDateRanges(recipe.model.dates)})
        for (const indicator of indicators) {
            if (signal.aborted) {
                return
            }
            let chunks = 0
            const tileProgress = () => report(progress({tileIndex, totalTiles, chunks, totalChunks: dateRanges.length}))
            tileProgress()
            // Each indicator's folder has the layout of a single-indicator export, so tools reading those still work.
            const indicatorDir = join(downloadDir, indicator, `${tileIndex}`)
            await forEachInParallel(dateRanges, CONCURRENT_CHUNKS, signal, async ({startDate, endDate}, chunkSignal) => {
                await exportToWorkspace({
                    start: () => sepal.startExport('task/export/timeseries/chunk', {...params, image: {...params.image, indicator}, tileId, tileIndex, startDate, endDate}),
                    downloadDir: join(indicatorDir, `chunk-${startDate}_${endDate}`),
                    sepal, report: () => {}, signal: chunkSignal, sleep, localProcessing
                })
                chunks++
                tileProgress()
            })
            if (dateRanges.length && !signal.aborted) {
                // One sits folder per tile: chip names repeat across tiles, and they name the sits files.
                const sits = additionalOutputs?.includes('SITS')
                    ? ['--band', indicator, '--sits-dir', join(downloadDir, 'sits', `${tileIndex}`)]
                    : []
                await localProcessing.run(() => stack([indicatorDir, ...sits]), signal)
            }
        }
    }
}

const stack = args =>
    lastValueFrom(
        terminal$('sepal-stack-time-series', args, {shell: false}).pipe(
            tap(({stream, value}) => {
                if (value) {
                    stream === 'stdout' ? log.info(value) : log.warn(value)
                }
            })
        ),
        {defaultValue: null}
    )

const progress = ({tileIndex, totalTiles, chunks, totalChunks}) => {
    const currentTilePercent = totalChunks ? Math.round(100 * chunks / totalChunks) : 0
    const currentTile = tileIndex + 1
    return currentTilePercent < 100
        ? {
            defaultMessage: `Exported ${currentTilePercent}% of tile ${currentTile} out of ${totalTiles}.`,
            messageKey: 'tasks.retrieve.time_series_to_sepal.progress',
            messageArgs: {currentTilePercent, currentTile, totalTiles}
        }
        : {
            defaultMessage: `Assembling tile ${currentTile} out of ${totalTiles}...`,
            messageKey: 'tasks.retrieve.time_series_to_sepal.assembling',
            messageArgs: {currentTile, totalTiles}
        }
}
