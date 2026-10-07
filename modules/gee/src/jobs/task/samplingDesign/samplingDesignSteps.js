import {catchError, concatMap, defer, from, map, of, throwError, toArray} from 'rxjs'

import {sanitizeEarthEngineAssetId, sanitizeEarthEngineTaskName} from '#sepal/earthEngineExportNames'
import ee from '#sepal/ee/ee'
import {ClientException} from '#sepal/exception'
import {getLogger} from '#sepal/log'

import {randomStep$} from './randomSteps.js'
import {systematicStep$} from './systematicSteps.js'
import {isTempAssetId} from './tempAssets.js'

const log = getLogger('samplingDesign')

const STEPS = {
    SYSTEMATIC: {kind: 'systematic', step$: systematicStep$},
    RANDOM: {kind: 'random', step$: randomStep$}
}

export const samplingDesignStep$ = (params, {sepalUser}) => defer(() => {
    const {recipe, state} = params
    const strategy = recipe?.model?.sampleArrangement?.arrangementStrategy
    const arrangement = Object.hasOwn(STEPS, strategy) ? STEPS[strategy] : null
    if (!arrangement) {
        return badRequest(`Unsupported sample arrangement strategy: ${strategy}`)
    }
    if (state && state.kind !== arrangement.kind) {
        return badRequest(`Sampling design state of kind ${state.kind} does not match the ${strategy} arrangement`)
    }
    const request = stepRequest(params)
    return request
        ? arrangement.step$(request, {sepalUser})
        : badRequest(`Unsupported sampling design destination: ${params.destination}`)
})

export const cleanupTempAssets$ = ({state}) => {
    const ids = Array.isArray(state?.tempAssetIds) ? state.tempAssetIds.filter(isTempAssetId) : []
    return from(ids).pipe(
        concatMap(id => ee.deleteAsset$(id).pipe(
            map(() => id),
            catchError(error => {
                log.warn(`Failed to delete temporary sampling asset ${id}:`, error)
                return of(null)
            })
        )),
        toArray(),
        map(results => ({deleted: results.filter(id => id)}))
    )
}

const stepRequest = ({description, properties, recipe, state, destination, assetId, strategy, workspacePath, filenamePrefix, fileFormat}) => {
    const safeDescription = sanitizeEarthEngineTaskName(description, 'Sampling_design')
    const common = {description: safeDescription, properties, recipe, state, destination}
    switch (destination) {
        case 'ASSET':
            return {...common, assetId: sanitizeEarthEngineAssetId(assetId), strategy}
        case 'SEPAL':
            return {
                ...common,
                workspacePath,
                filenamePrefix: sanitizeEarthEngineTaskName(filenamePrefix || safeDescription, safeDescription),
                fileFormat
            }
        default:
            return null
    }
}

const badRequest = message => throwError(() => new ClientException(message))
