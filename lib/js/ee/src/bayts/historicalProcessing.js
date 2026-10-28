import {map, of, switchMap, throwError} from 'rxjs'

import {assetProperties$} from '#sepal/ee/asset'
import imageFactory from '#sepal/ee/imageFactory'
import {ClientException} from '#sepal/exception'
import {assetProcessing, effectiveSettings, processingOfProducer, UNREADABLE_PROCESSING} from '#sepal/recipe/bayts/processing'
import {BAYTS_HISTORICAL_STATS} from '#sepal/recipe/capability/baytsHistoricalStats'
import {PRESERVES, PRODUCES, providerStep} from '#sepal/recipe/capability/providerStep'
import {BAYTS_ALERTS_PROCESSING} from '#sepal/recipe/requirement/baytsAlertsProcessing'
import {SUPPORTED} from '#sepal/recipe/requirement/verdict'
import {ASSET, RECIPE_REF} from '#sepal/recipe/source/reference'

import {currentPath, inPath} from '../executionPath.js'

export const HISTORICAL_PROCESSING_UNAVAILABLE = 'HISTORICAL_PROCESSING_UNAVAILABLE'

// The processing the historical statistics a reference stands for were built with (bayts/processing.js), from the
// recipe that computes them or the asset that holds them: the shared capability rule, one step at a time, loading each
// record as it is reached and nothing it depends on. No statistics are built to read it.
export const historicalProcessing$ = reference => {
    switch (reference?.type) {
        case RECIPE_REF:
            return imageFactory(reference).withRecord$(record =>
                inPath(currentPath(), producerProcessing$(record))
            ).pipe(
                switchMap(processing$ => processing$)
            )
        case ASSET:
            return assetProperties$(reference.id).pipe(map(assetProcessing))
        default:
            // A recipe given whole, as imageFactory takes one, is its own record.
            return reference?.model
                ? producerProcessing$(reference)
                : throwError(() => unavailable(`Not a reference historical statistics can be read from: ${JSON.stringify(reference)}`))
    }
}

const producerProcessing$ = record => {
    const {status, declared, reference} = providerStep(record, BAYTS_HISTORICAL_STATS)
    switch (status) {
        case PRODUCES: {
            const statsAsset = declared.statsAsset(record.model)
            return statsAsset
                ? historicalProcessing$({type: ASSET, id: statsAsset})
                : of(processingOfProducer(record.model))
        }
        case PRESERVES:
            return historicalProcessing$(reference)
        default:
            return throwError(() => unavailable(`Recipe does not provide historical statistics: ${record?.id ?? ''} (${record?.type})`))
    }
}

// The recipe as monitoring runs it, judged by the same rule the editor holds it to: refused where the reference's
// processing cannot be read.
export const effectiveBaytsAlerts = (recipe, processing) => {
    const verdict = BAYTS_ALERTS_PROCESSING.evaluate(processing, {model: recipe.model})
    const {model} = effectiveSettings(recipe.model, processing)
    if (verdict.status !== SUPPORTED || !model) {
        throw new ClientException('The processing the reference statistics were built with cannot be read', {
            errorCode: verdict.diagnostic?.code || UNREADABLE_PROCESSING
        })
    }
    return {...recipe, model}
}

const unavailable = message => new ClientException(message, {errorCode: HISTORICAL_PROCESSING_UNAVAILABLE})
