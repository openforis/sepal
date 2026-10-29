import {map, of, switchMap, throwError} from 'rxjs'

import {assetProperties$} from '#sepal/ee/asset'
import imageFactory from '#sepal/ee/imageFactory'
import {ClientException} from '#sepal/exception'
import {
    CCDC_SEGMENTS,
    MALFORMED_SEGMENT_SOURCE,
    UNSUPPORTED_SEGMENT_SOURCE
} from '#sepal/recipe/capability/ccdcSegments'
import {PRESERVES, PRODUCES, providerStep, UNSUPPORTED} from '#sepal/recipe/capability/providerStep'
import {monitoringParameters} from '#sepal/recipe/changeAlerts/monitoringMeasures'
import {assetProcessing, effectiveSettings, processingOfProducer, UNREADABLE_PROCESSING} from '#sepal/recipe/changeAlerts/processing'
import {ASSET as STORED_SEGMENTS, COMPUTED, MONITORED_MEASURE, sliceableMeasures} from '#sepal/recipe/requirement/ccdcSegments'
import {CHANGE_ALERTS_PROCESSING} from '#sepal/recipe/requirement/changeAlertsProcessing'
import {SUPPORTED} from '#sepal/recipe/requirement/verdict'
import {ASSET, RECIPE_REF} from '#sepal/recipe/source/reference'

import {currentPath, inPath} from '../executionPath.js'

// A ClientException so the diagnosis survives toException, which re-wraps a plain Error as a generic 500.
export class SegmentSourceException extends ClientException {
    constructor(code, message) {
        super(message, {errorCode: code})
        this.name = 'SegmentSourceException'
        this.code = code
    }
}

// The facts a consumer of CCDC segments needs about the source it was pointed at, taken from the recipe
// that actually produces those segments - a Masking over CCDC runs Masking's image and CCDC's dates.
//
// Facts first, image second: the selection the consumer builds with is the decision `selectableBaseBands`
// controls.
//
//   derive({dateFormat, selectableBaseBands}, buildImage) → whatever the consumer needs
export const withSegmentSource$ = (source, derive, {processing = false} = {}) =>
    source?.type === RECIPE_REF
        // The image is built in a second load of the same record - free, since the operation holds it -
        // so that it is constructed synchronously inside that load, under the selected recipe's ancestry.
        // A buildImage carried out of the first load has only the caller's, and the selected recipe would
        // vanish from the path its own references are followed on.
        ? segmentFacts$(source, processing).pipe(
            switchMap(facts =>
                imageFactory(source).withRecord$((_record, buildImage) => derive(facts, buildImage)))
        )
        : assetSourceFacts$(source, processing).pipe(
            map(facts => derive(facts, args => imageFactory(source, args)))
        )

// Subscribed under the record's own path, so the descent advances ancestry the way execution does.
const segmentFacts$ = (source, processing) =>
    imageFactory(source).withRecord$(record =>
        inPath(currentPath(), producerFacts$(record, source.dateFormat, processing))
    ).pipe(
        switchMap(facts$ => facts$)
    )

// The shared capability rule, one step at a time, loading each record as it is reached.
const producerFacts$ = (record, savedDateFormat, processing = false) => {
    const {status, declared, reference, role} = providerStep(record, CCDC_SEGMENTS)
    switch (status) {
        case PRODUCES:
            return declared.segmentsAsset
                ? assetFacts$(
                    declared.segmentsAsset(record.model),
                    declared.selectableBaseBands !== false,
                    savedDateFormat, processing
                )
                : of({
                    dateFormat: declared.dateFormat?.(record.model) ?? savedDateFormat,
                    ...(processing && {processing: processingOfProducer(record.model)}),
                    selectableBaseBands: declared.selectableBaseBands !== false
                })
        case PRESERVES:
            return referenceFacts$(reference, savedDateFormat, processing)
        case UNSUPPORTED:
            return throwError(() => new SegmentSourceException(
                UNSUPPORTED_SEGMENT_SOURCE,
                `Recipe does not produce segments: ${record?.id ?? ''} (${record?.type})`
            ))
        default:
            return throwError(() => new SegmentSourceException(
                MALFORMED_SEGMENT_SOURCE,
                `Recipe does not resolve its ${role} input: ${record?.id ?? ''} (${record?.type})`
            ))
    }
}

const referenceFacts$ = (reference, savedDateFormat, processing) => {
    switch (reference?.type) {
        case RECIPE_REF:
            return imageFactory(reference).withRecord$(record =>
                inPath(currentPath(), producerFacts$(record, savedDateFormat, processing))
            ).pipe(
                switchMap(facts$ => facts$)
            )
        case ASSET:
            return assetFacts$(reference.id, true, savedDateFormat, processing)
        default:
            return throwError(() => new SegmentSourceException(
                MALFORMED_SEGMENT_SOURCE,
                `Not a source segments can be read from: ${JSON.stringify(reference)}`
            ))
    }
}

// An explicitly configured representation is kept, zero included; otherwise the asset itself is asked.
const assetSourceFacts$ = (source, processing) =>
    source?.type === ASSET
        ? processing || source.dateFormat == null
            ? assetFacts$(source.id, true, source.dateFormat, processing)
            : of({dateFormat: source.dateFormat, selectableBaseBands: true})
        : throwError(() => new SegmentSourceException(
            MALFORMED_SEGMENT_SOURCE,
            `Not a source segments can be read from: ${JSON.stringify(source)}`
        ))

// The asset is authoritative for its own dates; the saved copy stands in only when it declares none, and
// a failed read never falls back to it.
const assetFacts$ = (assetId, selectableBaseBands, savedDateFormat, processing) =>
    assetProperties$(assetId).pipe(
        map(properties => ({
            dateFormat: properties.dateFormat ?? savedDateFormat, selectableBaseBands,
            ...(processing && {processing: assetProcessing(properties)})
        }))
    )

// Settings only: follow the declared producer chain without constructing its segments or loading training dependencies.
export const segmentSourceFacts$ = source => source?.type === RECIPE_REF
    ? segmentFacts$(source, true)
    : assetSourceFacts$(source, true)

export const effectiveChangeAlerts = (recipe, processing) => {
    const {model} = effectiveSettings(recipe.model, processing)
    const verdict = CHANGE_ALERTS_PROCESSING.evaluate(processing, {model: recipe.model})
    if (verdict.status !== SUPPORTED || !model) {
        throw new SegmentSourceException(verdict.diagnostic?.code || UNREADABLE_PROCESSING, 'The reference processing settings cannot be read')
    }
    return {...recipe, model}
}

// Computation authorization, separate from settings acquisition. Read the existing source catalogue, never its
// segments image, and judge the configured measure with the same rule and native scope as Sources.
export const requireMonitoredMeasure$ = (recipe, source = imageFactory(recipe.model.reference)) =>
    source.getBands$().pipe(map(names => {
        const facts = recipe.model.reference.type === ASSET
            ? {producer: STORED_SEGMENTS, assetId: recipe.model.reference.id, bands: names.map(name => ({name}))}
            : {producer: COMPUTED, measures: sliceableMeasures(names)}
        const verdict = MONITORED_MEASURE.evaluate(facts, monitoringParameters(recipe.model))
        if (verdict.status !== SUPPORTED) {
            throw new SegmentSourceException(verdict.diagnostic.code, `The configured monitoring measure cannot be used: ${verdict.diagnostic.code}`)
        }
        return recipe
    }))
