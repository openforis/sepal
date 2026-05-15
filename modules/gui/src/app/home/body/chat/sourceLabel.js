import {select} from '~/store'

export const resolveSourceLabel = (recipe, sourceId) => {
    if (!sourceId) return null
    if (sourceId === 'this-recipe') return 'self'
    if (sourceId === 'google-satellite') return 'google-satellite'
    const source = (recipe?.layers?.additionalImageLayerSources || []).find(s => s.id === sourceId)
    if (!source) return sourceId
    if (source.type === 'Recipe') {
        const refId = source.sourceConfig?.recipeId
        const name = (select('process.recipes') || []).find(r => r.id === refId)?.name
        return name ? `recipe:${name}` : refId ? `recipe:${refId}` : 'recipe'
    }
    if (source.type === 'Asset') {
        return source.sourceConfig?.asset ? `asset:${source.sourceConfig.asset}` : 'asset'
    }
    return source.type ? source.type.toLowerCase() : sourceId
}
