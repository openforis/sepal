import {catchError, defer, EMPTY, expand, map, of, reduce, retry, switchMap, tap, throwError, timer} from 'rxjs'
import {v4 as uuid} from 'uuid'

import {currentEEContext} from '#sepal/ee/eeContext'
import {createEEException} from '#sepal/ee/exception'
import {ClientException, ERROR_CODES} from '#sepal/exception'
import {getLogger} from '#sepal/log'
import {tag} from '#sepal/tag'

import {earthEngineErrorMessage, isTransient, statusClass} from './eeHttpError.js'
import {countEERequest} from './eeRequestMetric.js'
import * as requests from './eeRequests.js'

const log = getLogger('ee/rest')

const DEFAULT_MAX_RETRIES = 3
const MAX_RATE_LIMITED_RETRIES = 10
const MIN_RETRY_DELAY_MS = 500
const MAX_RETRY_DELAY_MS = 30 * 1000
const JITTER = 0.2

export const exponentialBackoff = (random = Math.random) => retryCount =>
    Math.min(MAX_RETRY_DELAY_MS, MIN_RETRY_DELAY_MS * Math.pow(2, retryCount - 1) * (1 - JITTER + 2 * JITTER * random()))

const backoff = exponentialBackoff()

// Sends Earth Engine requests over the REST API as the request context a call is subscribed in. The client
// library only builds them.
export class EERestClient {
    #ee
    #http
    #limiter$
    #serviceAccountToken$
    #recordRequest
    #delay$

    constructor({
        ee,
        http,
        limiter$,
        serviceAccountToken$,
        recordRequest = countEERequest,
        delay$ = retryCount => timer(backoff(retryCount))
    }) {
        this.#ee = ee
        this.#http = http
        this.#limiter$ = limiter$
        this.#serviceAccountToken$ = serviceAccountToken$
        this.#recordRequest = recordRequest
        this.#delay$ = delay$
    }

    getInfo$(eeObject, description, maxRetries) {
        return this.#send$({
            description,
            maxRetries,
            build: context => requests.computeValue(this.#ee, eeObject, context),
            read: ({result}) => result
        })
    }

    getMap$(eeObject, visParams, description, maxRetries) {
        return this.#send$({
            description,
            maxRetries,
            build: context => requests.createMap(this.#ee, eeObject, visParams, context),
            read: ({name}, {endpoint}) => ({
                mapId: name,
                token: '',
                urlTemplate: `${endpoint}/v1/${name}/tiles/{z}/{x}/{y}`,
                visParams
            })
        })
    }

    getAsset$(eeId, maxRetries = 0) {
        return eeId.startsWith('gs://')
            ? this.getInfo$(this.#ee.Image.loadGeoTIFF(eeId), `get COHG (${eeId})`, maxRetries).pipe(
                map(result => ({...result, id: eeId, properties: {}}))
            )
            : this.#send$({
                description: `get asset (${eeId})`,
                maxRetries,
                build: () => requests.getAsset(this.#ee, eeId),
                read: asset => this.#ee.rpc_convert.assetToLegacyResult(asset)
            })
    }

    listAssetsPage$(parentEEId, pageToken, maxRetries) {
        return this.#send$({
            description: `list assets (${parentEEId})`,
            maxRetries,
            build: () => requests.listAssets(this.#ee, parentEEId, pageToken),
            read: ({assets = [], nextPageToken} = {}) => ({
                nextPageToken,
                assets: assets.map(({type, id, name, updateTime}) => ({type, id, name, updateTime}))
            })
        })
    }

    listBuckets$(projectId, maxRetries = 0) {
        return this.#send$({
            description: `list buckets for (${projectId})`,
            maxRetries,
            build: () => requests.listBuckets(projectId),
            read: (body = {}) => body
        })
    }

    listOperations$(limit, maxRetries) {
        const page$ = pageToken => this.#send$({
            description: 'list operations',
            maxRetries,
            build: context => requests.listOperations(context, pageToken),
            read: ({operations = [], nextPageToken} = {}) => ({operations, nextPageToken})
        })
        return page$().pipe(
            expand(({nextPageToken}) => nextPageToken ? page$(nextPageToken) : EMPTY),
            reduce((all, {operations}) => [...all, ...operations], []),
            map(operations => limit ? operations.slice(0, limit) : operations)
        )
    }

    deleteAsset$(eeId, maxRetries = 0) {
        return this.#send$({
            description: `delete asset (${eeId})`,
            maxRetries,
            build: () => requests.deleteAsset(this.#ee, eeId),
            read: () => undefined
        })
    }

    renameAsset$(fromEEId, toEEId, maxRetries = 0) {
        return this.#send$({
            description: `rename asset (${fromEEId} => ${toEEId})`,
            maxRetries,
            build: () => requests.moveAsset(this.#ee, fromEEId, toEEId),
            read: () => undefined
        })
    }

    ensureAssetFolder$(parentId, assetId, maxRetries = 0) {
        return this.#send$({
            description: `create folder (${parentId}/${assetId})`,
            maxRetries,
            build: () => requests.createFolder(parentId, assetId),
            read: body => body,
            // Earth Engine refuses to create a folder that exists already with a 400.
            ignore: ({statusCode}) => statusCode === 400
        })
    }

    setAssetProperties$() {
        return unsupported$('setAssetProperties$')
    }

    createImageCollection$() {
        return unsupported$('createImageCollection$')
    }

    getTaskStatus$(taskId, description, maxRetries) {
        return this.#send$({
            description,
            maxRetries,
            build: () => requests.getOperation(this.#ee, taskId),
            read: operation => this.#ee.rpc_convert.operationToTask(operation)
        })
    }

    cancelTask$(taskId, description, maxRetries) {
        return this.#send$({
            description,
            maxRetries,
            build: () => requests.cancelOperation(this.#ee, taskId),
            read: () => undefined
        })
    }

    startTableExport$(task, description) {
        return this.#send$({
            description,
            maxRetries: 0,
            build: context => requests.exportTable(this.#ee, task, this.#ee.data.newTaskId()[0], context),
            read: operation => this.#ee.rpc_convert.operationToProcessingResponse(operation).taskId
        })
    }

    startImageExport$(task, description) {
        return this.#send$({
            description,
            maxRetries: 0,
            build: context => requests.exportImage(this.#ee, task, this.#ee.data.newTaskId()[0], context),
            read: operation => this.#ee.rpc_convert.operationToProcessingResponse(operation).taskId
        })
    }

    setAssetIamPolicy$(assetId, policy, maxRetries = 0) {
        return this.#send$({
            description: `set IAM policy (${assetId})`,
            maxRetries,
            build: () => requests.setAssetIamPolicy(assetId, policy),
            read: () => undefined
        })
    }

    // The context is read once, when the call is subscribed: every attempt is made as that request, whatever
    // async context later hops run in.
    #send$({description, maxRetries = DEFAULT_MAX_RETRIES, build, read, ignore = () => false}) {
        return defer(() => {
            const context = currentEEContext()
            const operationId = uuid()
            const started = Date.now()
            const eeTag = tag('EarthEngine', description, operationId, context.username)
            const report = outcome =>
                log.debug(() => `${eeTag} ${outcome} (${Date.now() - started}ms)`)
            let request
            try {
                request = build(context)
            } catch (error) {
                return throwError(() => this.#exception(error.message, {description, operationId, context}))
            }
            const retries = {rateLimited: 0, other: 0}
            let attempt = 0
            return defer(() => {
                attempt++
                return this.#limited$(request, context)
            }).pipe(
                retry({
                    delay: error => {
                        const delay$ = this.#retryDelay$(error, retries, maxRetries)
                        if (!delay$) {
                            return throwError(() => error)
                        }
                        log.warn(`${eeTag} attempt ${attempt} failed (${failureStatus(error)}), retrying`)
                        return delay$
                    }
                }),
                catchError(error => {
                    if (ignore(error)) {
                        return EMPTY
                    }
                    const message = error instanceof ServiceAccountTokenFailure
                        ? error.message
                        : earthEngineErrorMessage(error, request)
                    log.warn(`${eeTag} failed after ${attempt} attempt(s) (${failureStatus(error)}): ${message}`)
                    return throwError(() => this.#exception(
                        message,
                        {description, operationId, context, statusCode: error.statusCode}
                    ))
                }),
                map(body => read(body, context)),
                tap({
                    complete: () => report('completed'),
                    error: error => report(`error: ${error.message}`)
                })
            )
        })
    }

    // Earth Engine answers a burst over quota with 429s, so they get a retry budget of their own, whatever the
    // call's.
    #retryDelay$(error, retries, maxRetries) {
        if (error.statusCode === 429) {
            return retries.rateLimited < MAX_RATE_LIMITED_RETRIES
                ? this.#delay$(++retries.rateLimited)
                : null
        }
        return isTransient(error) && retries.other < maxRetries
            ? this.#delay$(++retries.other)
            : null
    }

    #limited$(request, context) {
        return this.#limiter$(
            this.#accessToken$(context).pipe(
                switchMap(accessToken => this.#execute$(request, context, accessToken))
            ),
            uuid(),
            {username: context.username, projectId: context.projectId, origin: context.origin}
        )
    }

    #accessToken$({auth}) {
        return auth.type === 'user'
            ? of(auth.accessToken)
            : this.#serviceAccountToken$().pipe(
                map(({accessToken}) => accessToken),
                catchError(cause => throwError(() => new ServiceAccountTokenFailure(cause)))
            )
    }

    #execute$({method, path, query, body}, {endpoint, projectId, auth}, accessToken) {
        const url = `${endpoint}/${path}`
        const options = {
            query,
            headers: {'Authorization': `Bearer ${accessToken}`, 'x-goog-user-project': projectId},
            responseType: 'json',
            retry: {maxRetries: 0}
        }
        const response$ = method === 'GET'
            ? this.#http.get$(url, options)
            : method === 'DELETE'
                ? this.#http.delete$(url, options)
                : this.#http.postJson$(url, {...options, body})
        return response$.pipe(
            tap({
                next: () => this.#record({auth: auth.type, status: '2xx'}),
                error: error => this.#record({auth: auth.type, status: statusClass(error)})
            }),
            map(({body}) => body)
        )
    }

    // Counting only observes a request: it must never fail it.
    #record(outcome) {
        try {
            this.#recordRequest(outcome)
        } catch (error) {
            log.warn('Failed to record an Earth Engine request:', error)
        }
    }

    #exception(message, {description, operationId, context, statusCode}) {
        return statusCode === 401 && context.auth.type === 'user'
            ? new ClientException(message, {
                errorCode: ERROR_CODES.MISSING_GOOGLE_TOKENS,
                userMessage: {
                    message: `Earth Engine: ${message}`,
                    key: 'gee.error.earthEngineException',
                    args: {earthEngineMessage: message}
                },
                operationId
            })
            : createEEException(message, description, operationId)
    }
}

// The token is fetched outside Earth Engine, so its failure has no HTTP status to tell what went wrong.
class ServiceAccountTokenFailure extends Error {
    constructor(cause) {
        super(`Could not obtain the service-account access token: ${cause?.message ?? cause}`, {cause})
    }
}

const failureStatus = error =>
    error.statusCode ? `HTTP ${error.statusCode}` : error.message

const unsupported$ = operation =>
    throwError(() => new Error(`${operation} is not supported by the Earth Engine REST transport`))
