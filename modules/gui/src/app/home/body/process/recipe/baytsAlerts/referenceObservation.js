import _ from 'lodash'
import {map, of, throwError} from 'rxjs'

import {BAYTS_HISTORICAL_STATS} from '#sepal/recipe/capability/baytsHistoricalStats'
import {PRIMARY_IMAGE} from '#sepal/recipe/type/baytsAlerts'
import {baytsHistoricalRefusals} from '#sepal/recipe/type/baytsHistorical'
import api from '~/apiRegistry'

import {selectedSourceOf} from '../sourceEvidence'
import {resolveProvider} from '../sourceProvider'
import {historicalStatsOf, statsAssetOf} from './historicalStatistics'

// What BAYTS Alerts observes about the reference it monitors, read by the shared evidence lifecycle: the radar
// processing options the historical statistics were built with, and what establishes the statistics themselves
// (`historicalStats`, historicalStatistics.js) - both from one read of the producer.
//
// The selection is what executes; the producer underneath it is only where these come from, and never replaces it.
// Whether the statistics suit the alerts is the requirement's to judge (sourceRequirement.js); an asset with no options
// simply seeds nothing. A reference that cannot be read is said in REF, as its section's status.

export const baytsAlertsObservation = {
    sourceReference: recipe => selectedSourceOf(recipe, PRIMARY_IMAGE),
    applyAccepted: ({evidence, previous}) => processingOptions(evidence, previous),
    observe$: ({recipe, recipesById}) => {
        const producer = resolveProvider(selectedSourceOf(recipe, PRIMARY_IMAGE), recipesById, BAYTS_HISTORICAL_STATS)
        return producer.error
            ? throwError(() => producer.error)
            : observed$(producer)
    }
}

// An observation repeated for another reason answers with the same options and changes nothing, so edits
// made to them since are left alone.
const processingOptions = ({sourceKey, options}, previous) => {
    const sameSource = previous?.sourceKey === sourceKey
    if (!options || (sameSource && _.isEqual(options, previous.options))) {
        return []
    }
    return [{path: 'model.options', value: options, merge: true}]
}

// A producer that computes the statistics carries the options it built them with; one whose statistics live in an
// asset carries them in the properties it was exported with, where its own declaration says they are, beside the bands
// its metadata types.
const observed$ = producer => {
    const statsAsset = statsAssetOf(producer)
    return statsAsset
        ? api.gee.assetMetadata$({asset: statsAsset}).pipe(
            map(metadata => ({
                options: seeding(parsed(metadata.properties?.recipe_options)),
                historicalStats: historicalStatsOf({producer, metadata})
            }))
        )
        : of({
            options: seeding(producer.record?.model?.options),
            historicalStats: historicalStatsOf({producer})
        })
}

// Options that cannot be read, or state passes BAYTS Historical could not have built, seed nothing: they only configure
// the alerts, and say nothing of the statistics.
const seeding = options =>
    _.isPlainObject(options) && (!Object.hasOwn(options, 'orbits') || !baytsHistoricalRefusals({options}).length)
        ? options
        : null

const parsed = value => {
    try {
        return value ? JSON.parse(value) : null
    } catch {
        return null
    }
}
