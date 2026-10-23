import {msg} from '~/translate'

// Exports submitted outside a recipe (pysepal-api) carry their kind instead of a recipe type, and name where
// they came from in taskInfo.origin: {type: 'NOTEBOOK' | 'SCRIPT' | 'APP' | 'SANDBOX'} with the path of the
// notebook, script or working directory, or an app's name. Exports from clients older than origin reporting
// (pysepal-api 0.4.0) have none and ran in the sandbox.

export const exportOrigin = taskInfo =>
    isExport(taskInfo)
        ? taskInfo.origin ?? {type: 'SANDBOX'}
        : null

export const taskTitle = taskInfo => {
    const origin = taskInfo?.recipeType ? {type: 'RECIPE'} : exportOrigin(taskInfo)
    const product = productName(taskInfo)
    return origin && product && taskInfo.destination
        ? `${originType(origin)} · ${product} → ${msg(`tasks.details.destination.${taskInfo.destination}`)}`
        : null
}

export const originType = origin =>
    msg(`tasks.details.originNames.${ORIGIN_TYPES.includes(origin.type) ? origin.type : 'SANDBOX'}`)

export const originName = origin =>
    origin.path
        ? homePath(origin.path)
        : origin.name || msg('tasks.details.originNotRecorded')

export const originText = origin =>
    `${originType(origin)} · ${originName(origin)}`

const productName = taskInfo =>
    taskInfo?.recipeType
        ? msg(`tasks.details.recipeTypeNames.${taskInfo.recipeType}`)
        : isExport(taskInfo)
            ? msg(`tasks.details.kindNames.${taskInfo.kind}`)
            : null

// pysepal-api sends paths inside the home folder relative to it, the home folder itself as '.'.
const homePath = path =>
    path.startsWith('/')
        ? path
        : path === '.' ? '~' : `~/${path}`

const ORIGIN_TYPES = ['RECIPE', 'NOTEBOOK', 'SCRIPT', 'APP', 'SANDBOX']

const isExport = taskInfo =>
    Boolean(taskInfo?.kind)
