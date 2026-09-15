import {map} from 'rxjs'

import {describeSegmentSource$} from '../segmentCapability'
import {withKnownIdentities} from '../visualizationMatching'
import {segmentVisualizations, selectedReference} from './referenceEvidence'

// What Change Alerts observes about the reference it monitors against: the description of the segments that
// reference stands for. Read by the shared evidence lifecycle, which decides when.

export const changeAlertsObservation = {
    sourceReference: selectedReference,
    observe$: ({recipe, graph, recipesById}) =>
        describeSegmentSource$(selectedReference(recipe), {graph, recipesById}).pipe(
            map(segments => ({
                segments: {
                    ...segments,
                    visualizations: withKnownIdentities(segments.visualizations, segmentVisualizations(recipe))
                }
            }))
        )
}
