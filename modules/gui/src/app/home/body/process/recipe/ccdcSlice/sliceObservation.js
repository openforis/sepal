import {map} from 'rxjs'

import {describeSegmentSource$} from '../segmentCapability'
import {withKnownIdentities} from '../visualizationMatching'
import {knownTemplates, selectedSource} from './sliceEvidence'

// What CCDC Slice observes about the source it slices: the description of the segments that source
// produces. Read by the shared evidence lifecycle, which decides when.
//
// Slice asks for the CCDC_SEGMENTS capability of the source it selected. Which recipe actually produces
// those segments, and whether the selection stands for one at all, is the capability's to answer.

export const resolveEvidence$ = ({recipe, graph, recipesById}) =>
    describeSegmentSource$(selectedSource(recipe), {graph, recipesById}).pipe(
        map(segments => ({
            segments: {
                ...segments,
                // A fresh read identifies an asset's templates anew. Keeping the identities the recipe
                // already knows them by is what lets a saved selection survive a refresh, and what keeps two
                // styles over one band separately selectable.
                visualizations: withKnownIdentities(segments.visualizations, knownTemplates(recipe))
            }
        }))
    )

export const sliceObservation = {
    sourceReference: selectedSource,
    observe$: resolveEvidence$
}
