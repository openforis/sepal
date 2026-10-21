import _ from 'lodash'
import {map, throwError} from 'rxjs'

import {PRIMARY_IMAGE} from '#sepal/recipe/type/changeAlerts'
import api from '~/apiRegistry'
import {selectFrom} from '~/stateUtils'

import {typedSegmentsAssetDescription} from '../ccdc/segmentsAsset'
import {describeProducer$, resolveSegmentProducer, segmentsAssetOf} from '../segmentCapability'
import {selectedSourceOf} from '../sourceEvidence'
import {withKnownIdentities} from '../visualizationMatching'
import {segmentVisualizations} from './referenceEvidence'

// Monitoring settings belong to Change Alerts; the segment description belongs to the producer.
// Both are read from the same producer record or asset response.

export const changeAlertsObservation = {
    sourceReference: recipe => selectedSourceOf(recipe, PRIMARY_IMAGE),
    applyAccepted: ({recipe, evidence, previous}) => [
        ...monitoringSettings(evidence, previous),
        ...assetDateFormat(recipe, evidence, previous)
    ],
    observe$: ({recipe, graph, recipesById}) => {
        const producer = resolveSegmentProducer(selectedSourceOf(recipe, PRIMARY_IMAGE), recipesById)
        if (producer.error) {
            return throwError(() => producer.error)
        }
        return observeProducer$(producer, {graph, recipesById}).pipe(
            map(({segments, monitoring}) => ({
                segments: {
                    ...segments,
                    visualizations: withKnownIdentities(segments.visualizations, segmentVisualizations(recipe))
                },
                monitoring
            }))
        )
    }
}

// Unchanged producer settings must not overwrite subsequent user edits. Of the producer's Sources, what configures the
// imagery monitored is taken, and only a change to that is a change: its Classification and breakpoint bands are not,
// for Change Alerts uses no Classification and fits no breakpoints (type/changeAlerts.js).
const monitoringSettings = ({sourceKey, monitoring}, previous) => {
    const taken = monitoringOf(monitoring)
    const sameSource = previous?.sourceKey === sourceKey
    if (!taken || (sameSource && _.isEqual(taken, monitoringOf(previous.monitoring)))) {
        return []
    }
    return [
        ...(taken.sources ? [{path: 'model.sources', value: taken.sources, merge: true}] : []),
        ...(taken.options ? [{path: 'model.options', value: taken.options, merge: true}] : [])
    ]
}

const monitoringOf = monitoring => monitoring && {
    sources: monitoring.sources ? _.omit(monitoring.sources, NOT_MONITORING) : monitoring.sources,
    options: monitoring.options
}

const NOT_MONITORING = ['classification', 'breakpointBands']

// Prefill on the first successful observation of a selection; preserve later user corrections.
const assetDateFormat = (recipe, {sourceKey, segments}, previous) => {
    const selected = selectFrom(recipe, 'model.reference') || {}
    return selected.type === 'ASSET'
        && segments?.dateFormat !== undefined
        && previous?.sourceKey !== sourceKey
        ? [{path: 'model.reference.dateFormat', value: segments.dateFormat}]
        : []
}

const observeProducer$ = (producer, context) => {
    const segmentsAsset = segmentsAssetOf(producer)
    return segmentsAsset
        ? api.gee.assetMetadata$({asset: segmentsAsset}).pipe(
            map(metadata => ({
                segments: typedSegmentsAssetDescription(metadata, {assetId: segmentsAsset}),
                monitoring: {
                    sources: parsed(metadata.properties?.recipe_sources),
                    options: parsed(metadata.properties?.recipe_options)
                }
            }))
        )
        : describeProducer$(producer, context).pipe(
            map(segments => ({
                segments,
                monitoring: {
                    sources: producer.record.model?.sources ?? null,
                    options: producer.record.model?.options ?? null
                }
            }))
        )
}

const parsed = value => value ? JSON.parse(value) : null
