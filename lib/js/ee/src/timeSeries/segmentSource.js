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
export const withSegmentSource$ = (source, derive) =>
    source?.type === RECIPE_REF
        // The image is built in a second load of the same record - free, since the operation holds it -
        // so that it is constructed synchronously inside that load, under the selected recipe's ancestry.
        // A buildImage carried out of the first load has only the caller's, and the selected recipe would
        // vanish from the path its own references are followed on.
        ? segmentFacts$(source).pipe(
            switchMap(facts =>
                imageFactory(source).withRecord$((_record, buildImage) => derive(facts, buildImage)))
        )
        : assetSourceFacts$(source).pipe(
            map(facts => derive(facts, args => imageFactory(source, args)))
        )

// Subscribed under the record's own path, so the descent advances ancestry the way execution does.
const segmentFacts$ = source =>
    imageFactory(source).withRecord$(record =>
        inPath(currentPath(), producerFacts$(record, source.dateFormat))
    ).pipe(
        switchMap(facts$ => facts$)
    )

// The shared capability rule, one step at a time, loading each record as it is reached.
const producerFacts$ = (record, savedDateFormat) => {
    const {status, declared, reference, role} = providerStep(record, CCDC_SEGMENTS)
    switch (status) {
        case PRODUCES:
            return declared.segmentsAsset
                ? assetFacts$(
                    declared.segmentsAsset(record.model),
                    declared.selectableBaseBands !== false,
                    savedDateFormat
                )
                : of({
                    dateFormat: declared.dateFormat?.(record.model) ?? savedDateFormat,
                    selectableBaseBands: declared.selectableBaseBands !== false
                })
        case PRESERVES:
            return referenceFacts$(reference, savedDateFormat)
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

const referenceFacts$ = (reference, savedDateFormat) => {
    switch (reference?.type) {
        case RECIPE_REF:
            return imageFactory(reference).withRecord$(record =>
                inPath(currentPath(), producerFacts$(record, savedDateFormat))
            ).pipe(
                switchMap(facts$ => facts$)
            )
        case ASSET:
            return assetFacts$(reference.id, true, savedDateFormat)
        default:
            return throwError(() => new SegmentSourceException(
                MALFORMED_SEGMENT_SOURCE,
                `Not a source segments can be read from: ${JSON.stringify(reference)}`
            ))
    }
}

// An explicitly configured representation is kept, zero included; otherwise the asset itself is asked.
const assetSourceFacts$ = source =>
    source?.type === ASSET
        ? source.dateFormat == null
            ? assetFacts$(source.id, true, undefined)
            : of({dateFormat: source.dateFormat, selectableBaseBands: true})
        : throwError(() => new SegmentSourceException(
            MALFORMED_SEGMENT_SOURCE,
            `Not a source segments can be read from: ${JSON.stringify(source)}`
        ))

// The asset is authoritative for its own dates; the saved copy stands in only when it declares none, and
// a failed read never falls back to it.
const assetFacts$ = (assetId, selectableBaseBands, savedDateFormat) =>
    assetProperties$(assetId).pipe(
        map(({dateFormat}) => ({dateFormat: dateFormat ?? savedDateFormat, selectableBaseBands}))
    )
