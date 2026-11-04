import {msg} from '~/translate'

// Exports submitted outside a recipe (pysepal-api) carry their kind instead of a recipe type, and name where
// they came from in taskInfo.origin: {type: 'NOTEBOOK' | 'SCRIPT' | 'APP' | 'SANDBOX'} with the path of the
// notebook, script or working directory, or an app's name. Exports from clients older than origin reporting
// (pysepal-api 0.4.0) have none and ran in the sandbox.

export const exportOrigin = taskInfo =>
    isExport(taskInfo)
        ? isObject(taskInfo.origin) ? taskInfo.origin : {type: 'SANDBOX'}
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

// task-manager stores the origin as the client sent it.
export const originName = ({path, name}) =>
    isText(path)
        ? homePath(path)
        : isText(name) ? name : msg('tasks.details.originNotRecorded')

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

const isObject = value =>
    value !== null && typeof value === 'object' && !Array.isArray(value)

const isText = value =>
    typeof value === 'string' && value !== ''
