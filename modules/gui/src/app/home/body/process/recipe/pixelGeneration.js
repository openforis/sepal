import {selectFrom} from '~/stateUtils'

import {assetEvidenceOfState} from '../sourceRuntime/assetEvidence'
import {buildMapDependencyGraph} from './mapDependencyGraph'
import {graphAssets} from './recipeOutput'

// What the pixels a preview draws were read from beyond the recipes it computes, as far as this session can tell: when
// each asset it reads was last seen to change and how often each was refreshed (assetEvidence.js), and how often the
// output itself was refreshed. A preview is drawn again when it changes, whether or not the description it draws from
// changed. Pixels can change without anything reporting it - a public collection reprocessed, a rewritten Cloud
// GeoTIFF - and such a change stays unseen until an explicit refresh.
//
// A change is a token differing from one read before it, not the first token learned: what was drawn before any token
// was known was drawn from whatever that first token describes.
export const pixelGeneration = ({recipeId, assets = [], assetEvidence = {}, sourceRefreshes = {}}) => ({
    refreshed: sourceRefreshes.recipes?.[recipeId] || 0,
    assets: assets.map(id => [id, assetEvidence[id]?.changedAt ?? null, sourceRefreshes.assets?.[id] || 0])
})

// Whether pixels drawn from `drawn` are still what `current` describes: the same refreshes, and no asset seen to change
// since. An asset whose change is unknown now - its evidence not read again yet, or cleared with replaced credentials -
// is no change, and neither is one the current answer does not name yet.
export const samePixels = (drawn, current) =>
    drawn.refreshed === current.refreshed
    && drawn.assets.every(([id, changedAt, refreshed]) => {
        const now = current.assets.find(([other]) => other === id)
        return !now || (now[2] === refreshed && (now[1] === null || now[1] === changedAt))
    })

// The same for a consumer reading the session rather than an output answer: the assets the recipe's session graph
// reaches. Null for a recipe the session does not hold.
export const pixelGenerationOfState = (state, recipeId) => {
    const loadedRecipes = selectFrom(state, 'process.loadedRecipes') || {}
    const recipe = loadedRecipes[recipeId]
    return recipe
        ? pixelGeneration({
            recipeId,
            assets: graphAssets(buildMapDependencyGraph({recipe, loadedRecipes})),
            assetEvidence: assetEvidenceOfState(state),
            sourceRefreshes: selectFrom(state, 'process.sourceRefreshes') || {}
        })
        : null
}
