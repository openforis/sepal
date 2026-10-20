import {catchError, concat, map, of, Subject, switchMap, timer} from 'rxjs'

import {defaultBufferMeters, isBufferMeters} from '#sepal/geoId/geoId'
import {toUserErrorMessage} from '~/userError'

// Results that block Apply: the GeoID or its buffer, as they stand, cannot be used. Any other failure leaves
// the GeoID unchecked rather than wrong, so it may still be saved.
const BLOCKING_ERRORS = {
    GEOID_NOT_FOUND: 'NOT_FOUND',
    GEOID_INVALID_GEOMETRY: 'INVALID_GEOMETRY',
    GEOID_INVALID_BUFFER: 'INVALID_BUFFER'
}

// Checks the GeoID an area of interest panel is editing against the GeoID service, and decides what the panel's
// buffer becomes. Each check belongs to the {geoId, bufferMeters} it was made for: a newer input, an invalid
// buffer included, cancels it, so a late result never reaches the panel.
//
// A state carries `setBufferMeters` when the buffer field must change: null to clear it, a number to fill it in.
// A changed GeoID clears it; a confirmed geometry fills an empty buffer with its default; a failed check leaves
// it as it is.
export class GeoIdCheck {
    #inputs$ = new Subject()
    #subscription
    #input
    #geometryType

    constructor({lookup$, onChange, delay = 300}) {
        this.#subscription = this.#inputs$.pipe(
            switchMap(input => states$({lookup$, input, delay}))
        ).subscribe(state => {
            if (state.geometryType && state.geoId === this.#input?.geoId) {
                this.#geometryType = state.geometryType
            }
            onChange(state)
        })
    }

    // A canonical GeoID or null, and the buffer field's text.
    update({geoId = null, bufferText = ''}) {
        const previous = this.#input
        const geoIdChanged = !!previous && geoId !== previous.geoId
        if (geoIdChanged) {
            this.#geometryType = undefined
        }
        const buffer = readBufferMeters(bufferText, this.#geometryType)
        if (!geoIdChanged && previous && !this.#changed(previous, buffer)) {
            return
        }
        this.#input = {
            geoId,
            bufferMeters: geoIdChanged ? null : buffer.value ?? null,
            invalid: !geoIdChanged && buffer.invalid,
            clearBuffer: geoIdChanged && !isBlank(bufferText),
            geometryType: this.#geometryType
        }
        this.#inputs$.next(this.#input)
    }

    dispose() {
        this.#subscription.unsubscribe()
    }

    #changed(previous, buffer) {
        if (buffer.invalid || previous.invalid) {
            return buffer.invalid !== previous.invalid
        }
        return this.#effective(buffer.value ?? null) !== this.#effective(previous.bufferMeters)
    }

    // An empty buffer is the confirmed geometry's default, so filling the default in checks nothing again.
    #effective(bufferMeters) {
        return bufferMeters ?? (this.#geometryType ? defaultBufferMeters(this.#geometryType) : null)
    }
}

// The buffer field's text as {value} in metres, {} when empty, or {invalid: true} for a buffer the geometry -
// when known - does not accept.
export const readBufferMeters = (text, geometryType) => {
    if (isBlank(text)) {
        return {}
    }
    const value = Number(text)
    return isBufferMeters(value, geometryType) ? {value} : {invalid: true}
}

export const allowsApply = ({status}) =>
    ['CHECKED', 'NOT_CHECKED'].includes(status)

const states$ = ({lookup$, input, delay}) => {
    const {geoId, geometryType} = input
    if (!geoId) {
        return of({status: 'NONE'})
    }
    if (input.invalid) {
        return of({status: 'INVALID_INPUT', geoId, geometryType})
    }
    return concat(
        of({status: 'PENDING', geoId, geometryType, ...(input.clearBuffer ? {setBufferMeters: null} : {})}),
        timer(delay).pipe(switchMap(() => check$(lookup$, input)))
    )
}

const check$ = (lookup$, {geoId, bufferMeters, geometryType: knownGeometryType}) =>
    lookup$({geoId, bufferMeters: bufferMeters ?? undefined}).pipe(
        map(({geometryType, bounds}) => ({
            status: 'CHECKED',
            geoId,
            geometryType,
            bounds,
            bufferMeters,
            ...(bufferMeters === null ? {setBufferMeters: defaultBufferMeters(geometryType)} : {})
        })),
        catchError(error => {
            const {errorCode, messageArgs} = error?.response || {}
            return of({
                status: BLOCKING_ERRORS[errorCode] || 'NOT_CHECKED',
                geoId,
                geometryType: knownGeometryType ?? messageArgs?.geometryType,
                error: toUserErrorMessage(error)
            })
        })
    )

const isBlank = value =>
    value === null || value === undefined || String(value).trim() === ''
