import {map, of, throwError} from 'rxjs'

import {assetProcessing, processingOfProducer} from '#sepal/recipe/bayts/processing'
import {BAYTS_HISTORICAL_STATS} from '#sepal/recipe/capability/baytsHistoricalStats'
import {PRIMARY_IMAGE} from '#sepal/recipe/type/baytsAlerts'
import api from '~/apiRegistry'

import {selectedSourceOf} from '../sourceEvidence'
import {resolveProvider} from '../sourceProvider'
import {historicalStatsOf, statsAssetOf} from './historicalStatistics'

// What BAYTS Alerts observes about the reference it monitors, read by the shared evidence lifecycle: the radar
// processing the historical statistics were built with (`processing`, #sepal/recipe/bayts/processing), and what
// establishes the statistics themselves (`historicalStats`, historicalStatistics.js) - both from one read of the producer.
//
// The selection is what executes; the producer underneath it is only where these come from, and never replaces it.
// Observing configures nothing: the alerts read the reference's processing where they need it, and a new recipe is
// seeded with the reference's monitoring choices when its first reference is applied (panels/reference/reference.jsx).
// Whether the statistics suit the alerts is the requirement's to judge (sourceRequirement.js). A reference that cannot
// be read is said in REF, as its section's status.

export const baytsAlertsObservation = {
    sourceReference: recipe => selectedSourceOf(recipe, PRIMARY_IMAGE),
    observe$: ({recipe, recipesById}) => {
        const producer = resolveProvider(selectedSourceOf(recipe, PRIMARY_IMAGE), recipesById, BAYTS_HISTORICAL_STATS)
        return producer.error
            ? throwError(() => producer.error)
            : observed$(producer)
    }
}

// A producer that computes the statistics carries the options it built them with; one whose statistics live in an
// asset carries them in the properties it was exported with, beside the bands its metadata types.
const observed$ = producer => {
    const statsAsset = statsAssetOf(producer)
    return statsAsset
        ? api.gee.assetMetadata$({asset: statsAsset}).pipe(
            map(metadata => ({
                processing: assetProcessing(metadata.properties),
                historicalStats: historicalStatsOf({producer, metadata})
            }))
        )
        : of({
            processing: processingOfProducer(producer.record?.model),
            historicalStats: historicalStatsOf({producer})
        })
}
