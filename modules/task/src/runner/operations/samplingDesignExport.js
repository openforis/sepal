import {mkdir} from 'fs/promises'
import {join} from 'path'

import {sanitizeEarthEngineTaskName} from '#sepal/earthEngineExportNames'
import {getLogger} from '#sepal/log'

import {followEEExport} from '../eeExport.js'
import {exportToWorkspace} from '../workspaceExport.js'

const log = getLogger('samplingDesign')

const PREPARE = {messageKey: 'tasks.samplingDesign.progress.prepare', defaultMessage: 'Preparing samples'}

// gee runs the workflow one stage at a time and owns its state; this only follows what each stage started and
// always lets gee delete the temporary assets.
export const samplingDesignExport = destination => async (params, {sepal, report, signal, sleep}) => {
    let state = null
    try {
        report(PREPARE)
        while (!signal.aborted) {
            const step = await sepal.startExport('task/samplingDesign/step', {...params, destination, state})
            state = step.state
            step.progress?.forEach(report)
            if (step.action === 'done') {
                return
            }
            await followStep(step, {params, sepal, report, signal, sleep})
            if (!signal.aborted && step.next) {
                report(step.next)
            }
        }
    } finally {
        await cleanup(state, sepal)
    }
}

const followStep = async (step, {params, sepal, report, signal, sleep}) => {
    const {action, eeTaskId} = step
    if (action === 'workspace') {
        await exportToWorkspace({
            start: async () => ({eeTaskId, destination: step.destination}),
            downloadDir: await downloadDir(params), sepal, report, signal, sleep
        })
    } else if (action === 'export') {
        await followEEExport({eeTaskId, sepal, report, signal, sleep})
    } else {
        throw new Error(`Unknown sampling design step action: ${action}`)
    }
}

const downloadDir = async ({description, workspacePath}) => {
    const dir = workspacePath
        ? join(process.env.HOME, workspacePath)
        : join(process.env.HOME, 'downloads', sanitizeEarthEngineTaskName(description, 'Sampling_design'))
    await mkdir(dir, {recursive: true})
    return dir
}

const cleanup = async (state, sepal) => {
    if (state?.tempAssetIds?.length) {
        try {
            await sepal.gee('task/samplingDesign/cleanup', {state})
        } catch (error) {
            log.warn('Temporary sampling design assets could not be removed', error)
        }
    }
}
