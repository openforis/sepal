import {map, throwError} from 'rxjs'

import {ASSET} from '#sepal/recipe/source/reference'

import {getRecipeType} from '../../recipeTypeRegistry'
import {describeSegmentsAsset$} from '../ccdc/segmentsAsset'
import {withKnownIdentities} from '../visualizationMatching'
import {knownTemplates, selectedSource} from './sliceEvidence'

// What CCDC Slice observes about the source it slices: the description of the segments that source
// produces. Read by the shared evidence lifecycle, which decides when.
//
// Slice asks the source to describe itself. A recipe source is dispatched through the recipe type registry
// to the provider its own type registers, so nothing here recognises producer types or reaches into their
// models; a bare asset is described by the segments-asset adapter.

export const resolveEvidence$ = ({recipe, graph, recipesById}) =>
    describeSource$(selectedSource(recipe), {graph, recipesById}).pipe(
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

const describeSource$ = (reference, {graph, recipesById}) => {
    if (reference.type === ASSET) {
        return describeSegmentsAsset$(reference.id)
    }
    const record = recipesById.get(reference.id)
    if (!record) {
        return throwError(() => new Error(`Source recipe ${reference.id} was not resolved`))
    }
    const describe$ = getRecipeType(record.type)?.describeSegments$
    if (!describe$) {
        return throwError(() => new Error(`A ${record.type} recipe does not produce CCDC segments`))
    }
    return describe$({recipe: record, graph, recipesById})
}
