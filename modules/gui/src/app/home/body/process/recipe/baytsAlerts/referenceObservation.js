import _ from 'lodash'
import {map, of, throwError} from 'rxjs'

import {BAYTS_HISTORICAL_STATS} from '#sepal/recipe/capability/baytsHistoricalStats'
import {ASSET} from '#sepal/recipe/source/reference'
import {PRIMARY_IMAGE} from '#sepal/recipe/type/baytsAlerts'
import api from '~/apiRegistry'
import {msg} from '~/translate'
import {Notifications} from '~/widget/notifications'

import {selectedSourceOf} from '../sourceEvidence'
import {resolveProvider} from '../sourceProvider'

// What BAYTS Alerts observes about the reference it monitors: the radar processing options the historical
// statistics were built with, read by the shared evidence lifecycle.
//
// The selection is what executes; the producer underneath it is only where the options come from, and never
// replaces it. Nothing here establishes that a source really carries BAYTS statistics - an asset mosaic says
// where its options would be read from, and an asset that has none simply seeds nothing.

export const baytsAlertsObservation = {
    sourceReference: recipe => selectedSourceOf(recipe, PRIMARY_IMAGE),
    applyAccepted: ({evidence, previous}) => processingOptions(evidence, previous),
    // Nothing in these panels shows a withheld answer: the preprocess options go on reading as they did, so
    // a failure that seeded nothing would look like one that had nothing to seed.
    reportUnavailable: ({recipe, error}) => Notifications.error({
        message: msg(selectedSourceOf(recipe, PRIMARY_IMAGE)?.type === ASSET
            ? 'process.baytsAlerts.reference.asset.loadError'
            : 'process.baytsAlerts.reference.recipe.loadError'),
        error
    }),
    observe$: ({recipe, recipesById}) => {
        const producer = resolveProvider(selectedSourceOf(recipe, PRIMARY_IMAGE), recipesById, BAYTS_HISTORICAL_STATS)
        return producer.error
            ? throwError(() => producer.error)
            : options$(producer).pipe(map(options => ({options})))
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

// A producer that computes the statistics carries the options it built them with; one whose statistics live
// in an asset carries them in the properties it was exported with, where its own declaration says they are.
const options$ = ({assetId, record, declared}) => {
    const statsAsset = assetId !== undefined ? assetId : declared?.statsAsset?.(record.model) ?? null
    return statsAsset
        ? api.gee.assetMetadata$({asset: statsAsset}).pipe(
            map(({properties}) => parsed(properties?.recipe_options))
        )
        : of(record?.model?.options ?? null)
}

const parsed = value => value ? JSON.parse(value) : null
