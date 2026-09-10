import {forkJoin, map, of} from 'rxjs'

import {INHERITED, inheritedSchemaSource} from '#sepal/recipe/output/inheritedSchemaSource'
import {ASSET} from '#sepal/recipe/source/reference'
import api from '~/apiRegistry'
import {toVisualizations} from '~/app/home/map/imageLayerSource/assetVisualizationParser'

import {getRecipeType} from '../../recipeTypeRegistry'
import {inheritedSourceReference} from '../sourceEvidence'
import {observedBands} from '../sourceEvidenceSync'
import {outputOwnedVisualizations, sourceVisualizations} from '../visualizations'

// What a recipe that preserves its input's schema observes about that input: the bands it will output and
// the presets it may offer. Read by the shared evidence lifecycle, which decides when.
//
// Bands come from the IMMEDIATE source, whose running image is what this recipe outputs however deep the
// wrapping goes. Presets do not: a wrapper has none of its own, and the ones it copied are the stale
// snapshot this mechanism replaces, so they come from wherever the declared chain stops inheriting - with
// the styles each wrapper in between owns for its own output added along the way.

export const maskingObservation = {
    sourceReference: inheritedSourceReference,
    observe$: ({recipe, graph, recipesById}) => {
        const {immediate, terminal, wrappers} = inheritanceChain(graph, recipe)
        return forkJoin({
            bands: bands$(immediate),
            visualizations: presets$(terminal, {graph, recipesById}).pipe(
                map(inherited => [...wrappers.flatMap(outputOwnedVisualizations), ...inherited])
            )
        })
    }
}

const bands$ = ({kind, id, record}) =>
    kind === ASSET
        ? api.gee.bands$({asset: id, includeDataTypes: true}).pipe(map(observedBands))
        : api.gee.bands$({recipe: record, includeDataTypes: true}).pipe(map(observedBands))

const presets$ = ({kind, id, record}, {graph, recipesById}) => {
    if (kind === ASSET) {
        // Presentation only. The physical schema is observed through `/bands` like any other image, so an
        // asset's properties are never asked what bands exist.
        return api.gee.assetMetadata$({asset: id}).pipe(
            map(metadata => toVisualizations(metadata.properties, metadata.bandNames || []))
        )
    }
    if (!record) {
        return of([])
    }
    // A source whose own presets depend on ITS source resolves them here, so a saved recipe that has never
    // been opened still offers what it describes.
    const resolve$ = getRecipeType(record.type)?.resolveEvidence$
    return resolve$
        ? resolve$({recipe: record, graph, recipesById}).pipe(map(evidence => sourceVisualizations(record, evidence)))
        : of(sourceVisualizations(record))
}

// The declared chain, read over records the shared closure already resolved. One edge per recipe, so it
// terminates with the graph rather than with a limit of its own; the visited set only declines to loop on a
// graph that reported no cycle. `immediate` is what this recipe outputs, `terminal` is what owns the
// presets, and `wrappers` are the recipes passed through on the way.
const inheritanceChain = (graph, root) => {
    const recipesById = new Map(graph.recipes.map(recipe => [recipe.id, recipe]))
    const wrappers = []
    const visited = new Set([root.id])
    let immediate = null
    let record = root
    for (;;) {
        const {status, reference} = inheritedSchemaSource(record)
        if (status !== INHERITED) {
            return {immediate, wrappers, terminal: {kind: 'RECIPE', record}}
        }
        // Every recipe that inherits and is not the root is passed THROUGH. The root's own styles are the
        // consumer's locals, and the terminal's arrive with its presets.
        if (record !== root) {
            wrappers.push(record)
        }
        const next = reference.type === ASSET ? null : recipesById.get(reference.id)
        const step = reference.type === ASSET
            ? {kind: ASSET, id: reference.id}
            : {kind: 'RECIPE', id: reference.id, record: next}
        immediate = immediate || step
        if (reference.type === ASSET) {
            return {immediate, wrappers, terminal: step}
        }
        if (!next || visited.has(reference.id)) {
            return {immediate, wrappers, terminal: {kind: 'RECIPE'}}
        }
        visited.add(reference.id)
        record = next
    }
}
