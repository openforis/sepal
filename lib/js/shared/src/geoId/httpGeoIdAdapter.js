import {Observable, retry, throwError, timer} from 'rxjs'

import {NotFoundException, ServerException} from '#sepal/exception'
import {getLogger} from '#sepal/log'

import {geoIdGeometryProblem} from './geoIdGeometry.js'

const log = getLogger('geoId')

export const DEFAULT_GEOID_ENDPOINT = 'https://data.apps.fao.org/geoid'

export const GEOID_ERROR_CODES = {
    NOT_FOUND: 'GEOID_NOT_FOUND',
    UNREACHABLE: 'GEOID_UNREACHABLE',
    SERVICE_ERROR: 'GEOID_SERVICE_ERROR',
    REJECTED: 'GEOID_REJECTED',
    RATE_LIMITED: 'GEOID_RATE_LIMITED',
    UNUSABLE_RESPONSE: 'GEOID_UNUSABLE_RESPONSE',
    INVALID_GEOMETRY: 'GEOID_INVALID_GEOMETRY'
}

const RETRYABLE = [GEOID_ERROR_CODES.UNREACHABLE, GEOID_ERROR_CODES.SERVICE_ERROR]

// The only code that speaks to the GeoID service. It answers a GeoID with its feature, or fails with an
// exception that says what the service did - not registered, unreachable, an error of its own, refused,
// rate-limited, or answered with something unusable - so a caller can tell an absent GeoID from an outage.
//
// The deadline covers the whole response, body included, and an attempt is aborted when it passes or when the
// subscriber leaves. Only an outage is retried: what the service says about a GeoID will not change by asking
// again.
export class HttpGeoIdAdapter {
    #endpoint
    #host
    #timeout
    #retryDelay
    #maxResponseBytes

    constructor({
        endpoint = DEFAULT_GEOID_ENDPOINT,
        timeout = 8000,
        retryDelay = 1000,
        maxResponseBytes = 10 * 1024 * 1024
    } = {}) {
        this.#endpoint = endpoint.replace(/\/+$/, '')
        this.#host = new URL(this.#endpoint).host
        this.#timeout = timeout
        this.#retryDelay = retryDelay
        this.#maxResponseBytes = maxResponseBytes
    }

    // {id, geometry} for a canonical GeoID, the geometry a validated GeoJSON geometry.
    feature$(geoId) {
        return this.#attempt$(geoId).pipe(
            retry({
                count: 1,
                delay: error => RETRYABLE.includes(error.errorCode)
                    ? timer(this.#retryDelay)
                    : throwError(() => error)
            })
        )
    }

    #attempt$(geoId) {
        return new Observable(subscriber => {
            const controller = new AbortController()
            let timedOut = false
            const deadline = setTimeout(() => {
                timedOut = true
                controller.abort()
            }, this.#timeout)
            this.#fetchFeature(geoId, controller.signal)
                .catch(error => {
                    throw timedOut
                        ? this.#unreachable(geoId, `no complete response within ${this.#timeout} ms`, error)
                        : error.sepalException ? error : this.#unreachable(geoId, error.message, error)
                })
                .then(
                    feature => {
                        subscriber.next(feature)
                        subscriber.complete()
                    },
                    error => subscriber.error(error)
                )
                .finally(() => clearTimeout(deadline))
            return () => {
                clearTimeout(deadline)
                controller.abort()
            }
        })
    }

    async #fetchFeature(geoId, signal) {
        const url = `${this.#endpoint}/${encodeURIComponent(geoId)}`
        log.debug(() => `Resolving GeoID ${geoId} from ${url}`)
        const response = await fetch(url, {
            headers: {Accept: 'application/geo+json, application/json'},
            signal
        })
        if (!response.ok) {
            await response.body?.cancel().catch(() => null)
            throw this.#statusFailure(geoId, response.status)
        }
        const body = await this.#readBody(geoId, response)
        return this.#toFeature(geoId, body)
    }

    // Enforced while reading, so an oversized response is abandoned rather than buffered first.
    async #readBody(geoId, response) {
        const reader = response.body.getReader()
        const chunks = []
        let size = 0
        for (;;) {
            const {done, value} = await reader.read()
            if (done) {
                break
            }
            size += value.byteLength
            if (size > this.#maxResponseBytes) {
                await reader.cancel().catch(() => null)
                throw this.#unusable(geoId, `response exceeds ${this.#maxResponseBytes} bytes`)
            }
            chunks.push(value)
        }
        return new TextDecoder().decode(concat(chunks, size))
    }

    #toFeature(geoId, body) {
        let feature
        try {
            feature = JSON.parse(body)
        } catch (error) {
            throw this.#unusable(geoId, `invalid JSON (${error.message})`, error)
        }
        if (!feature || typeof feature !== 'object' || !('geometry' in feature)) {
            throw this.#unusable(geoId, 'response is not a GeoJSON feature')
        }
        const problem = geoIdGeometryProblem(feature.geometry)
        if (problem) {
            throw this.#failure(geoId, {
                errorCode: GEOID_ERROR_CODES.INVALID_GEOMETRY,
                detail: problem,
                key: 'gee.geoId.error.invalidGeometry',
                message: `The geometry of GeoID ${geoId} from the GeoID service (${this.#host}) could not be used.`
            })
        }
        return {id: geoId, geometry: feature.geometry}
    }

    #statusFailure(geoId, status) {
        if (status === 404) {
            return new NotFoundException(this.#detail(geoId, 'HTTP 404'), {
                errorCode: GEOID_ERROR_CODES.NOT_FOUND,
                userMessage: this.#userMessage({
                    key: 'gee.geoId.error.notFound',
                    message: `GeoID ${geoId} is not registered with the GeoID service (${this.#host}).`,
                    geoId
                })
            })
        }
        if (status === 429) {
            return this.#failure(geoId, {
                errorCode: GEOID_ERROR_CODES.RATE_LIMITED,
                detail: 'HTTP 429',
                key: 'gee.geoId.error.rateLimited',
                message: `The GeoID service (${this.#host}) is limiting requests. Try again later.`
            })
        }
        if (status >= 500) {
            return this.#failure(geoId, {
                errorCode: GEOID_ERROR_CODES.SERVICE_ERROR,
                detail: `HTTP ${status}`,
                key: 'gee.geoId.error.serviceError',
                message: `The GeoID service (${this.#host}) reported an error (HTTP ${status}). Try again later.`,
                status
            })
        }
        if (status >= 400) {
            return this.#failure(geoId, {
                errorCode: GEOID_ERROR_CODES.REJECTED,
                detail: `HTTP ${status}`,
                key: 'gee.geoId.error.rejected',
                message: `The GeoID service (${this.#host}) refused the request (HTTP ${status}).`,
                status
            })
        }
        return this.#unusable(geoId, `HTTP ${status}`)
    }

    #unreachable(geoId, detail, cause) {
        return this.#failure(geoId, {
            errorCode: GEOID_ERROR_CODES.UNREACHABLE,
            detail,
            cause,
            key: 'gee.geoId.error.unreachable',
            message: `SEPAL could not reach the GeoID service (${this.#host}). Try again later.`
        })
    }

    #unusable(geoId, detail, cause) {
        return this.#failure(geoId, {
            errorCode: GEOID_ERROR_CODES.UNUSABLE_RESPONSE,
            detail,
            cause,
            key: 'gee.geoId.error.unusableResponse',
            message: `The GeoID service (${this.#host}) returned a response SEPAL could not use.`
        })
    }

    // 502: whatever went wrong happened beyond SEPAL, at or on the way to the GeoID service.
    #failure(geoId, {errorCode, detail, cause, key, message, status}) {
        return new ServerException(this.#detail(geoId, detail), {
            cause,
            errorCode,
            statusCode: 502,
            userMessage: this.#userMessage({key, message, geoId, status})
        })
    }

    #userMessage({key, message, geoId, status}) {
        return {
            message,
            key,
            args: {geoId, host: this.#host, ...(status ? {status} : {})}
        }
    }

    #detail(geoId, detail) {
        return `GeoID ${geoId} from ${this.#endpoint}: ${detail}`
    }
}

const concat = (chunks, size) => {
    const bytes = new Uint8Array(size)
    let offset = 0
    chunks.forEach(chunk => {
        bytes.set(chunk, offset)
        offset += chunk.byteLength
    })
    return bytes
}
