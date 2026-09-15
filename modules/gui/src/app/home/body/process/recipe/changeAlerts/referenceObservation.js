import _ from 'lodash'
import {map, throwError} from 'rxjs'

import api from '~/apiRegistry'
import {selectFrom} from '~/stateUtils'

import {segmentsAssetDescription} from '../ccdc/segmentsAsset'
import {describeProducer$, resolveSegmentProducer, segmentsAssetOf} from '../segmentCapability'
import {withKnownIdentities} from '../visualizationMatching'
import {segmentVisualizations, selectedReference} from './referenceEvidence'

// Monitoring settings belong to Change Alerts; the segment description belongs to the producer.
// Both are read from the same producer record or asset response.

export const changeAlertsObservation = {
    sourceReference: selectedReference,
    applyAccepted: ({recipe, evidence, previous}) => [
        ...monitoringSettings(evidence, previous),
        ...assetDateFormat(recipe, evidence, previous)
    ],
    observe$: ({recipe, graph, recipesById}) => {
        const producer = resolveSegmentProducer(selectedReference(recipe), recipesById)
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

// Unchanged producer settings must not overwrite subsequent user edits.
const monitoringSettings = ({sourceKey, monitoring}, previous) => {
    const sameSource = previous?.sourceKey === sourceKey
    if (!monitoring || (sameSource && _.isEqual(monitoring, previous.monitoring))) {
        return []
    }
    return [
        ...(monitoring.sources ? [{path: 'model.sources', value: monitoring.sources, merge: true}] : []),
        ...(monitoring.options ? [{path: 'model.options', value: monitoring.options, merge: true}] : [])
    ]
}

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
                segments: segmentsAssetDescription(metadata),
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
