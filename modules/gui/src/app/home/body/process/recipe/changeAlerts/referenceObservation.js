import {map, throwError} from 'rxjs'

import {CCDC_SEGMENTS} from '#sepal/recipe/capability/ccdcSegments'
import {PRESERVES, PRODUCES, providerStep} from '#sepal/recipe/capability/providerStep'
import {assetProcessing, processingOfProducer} from '#sepal/recipe/changeAlerts/processing'
import {directSourceEdges} from '#sepal/recipe/source/directSources'
import {PRIMARY_IMAGE} from '#sepal/recipe/type/changeAlerts'
import api from '~/apiRegistry'

import {typedSegmentsAssetDescription} from '../ccdc/segmentsAsset'
import {describeProducer$, resolveSegmentProducer, segmentsAssetOf} from '../segmentCapability'
import {selectedSourceOf} from '../sourceEvidence'
import {withKnownIdentities} from '../visualizationMatching'
import {segmentVisualizations} from './referenceEvidence'

// Monitoring settings belong to Change Alerts; the segment description belongs to the producer.
// Both are read from the same producer record or asset response.

export const changeAlertsObservation = {
    sourceReference: recipe => selectedSourceOf(recipe, PRIMARY_IMAGE),
    sourcesOf: record => {
        const step = providerStep(record, CCDC_SEGMENTS)
        const direct = directSourceEdges(record)
        const asset = step.status === PRODUCES && step.declared.segmentsAsset?.(record.model)
        return {diagnostics: [], edges: direct.edges.filter(edge => step.status === PRESERVES
            ? edge.role === step.role : asset && edge.reference.type === 'ASSET' && edge.reference.id === asset)}
    },
    observe$: ({recipe, graph, recipesById}) => {
        const producer = resolveSegmentProducer(selectedSourceOf(recipe, PRIMARY_IMAGE), recipesById)
        if (producer.error) {
            return throwError(() => producer.error)
        }
        return observeProducer$(producer, {graph, recipesById}).pipe(
            map(({segments, processing}) => ({
                segments: {
                    ...segments,
                    visualizations: withKnownIdentities(segments.visualizations, segmentVisualizations(recipe))
                },
                processing
            }))
        )
    }
}

const observeProducer$ = (producer, context) => {
    const segmentsAsset = segmentsAssetOf(producer)
    return segmentsAsset
        ? api.gee.assetMetadata$({asset: segmentsAsset}).pipe(
            map(metadata => ({
                segments: typedSegmentsAssetDescription(metadata, {assetId: segmentsAsset}),
                processing: assetProcessing(metadata.properties)
            }))
        )
        : describeProducer$(producer, context).pipe(
            map(segments => ({
                segments,
                processing: processingOfProducer(producer.record.model)
            }))
        )
}
