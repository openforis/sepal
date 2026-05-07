const createAssetTools = ({geeClient}) => [
    {
        name: 'asset_search',
        description: `Search the Earth Engine STAC catalog and the Awesome GEE Community Datasets list for assets matching a free-text query. Use this to resolve an asset id when the user names a dataset (e.g. "Hansen forest cover", "WorldCover", "Dynamic World"). Returns \`{matchingResults, gee:{matchingResults, moreResults, datasets:[{id, title, type, url}]}, community:{...}}\` — up to 10 results per source. When reporting back to the user, mention the total \`matchingResults\` count (and \`moreResults\` if some were truncated). Some assets (e.g. the global CCDC \`projects/CCDC/v4\`) are not in the catalog and will not appear here — those are documented as use-cases on the ASSET_MOSAIC recipe.

How to construct queries:
- Use ONLY dataset-identifying nouns from the user's request (sensor, algorithm, product, well-known dataset name). Stick to a single distinctive term where possible.
- NEVER include year, date, country, region, or any AOI words — those are recipe parameters, not search terms. They will not appear in dataset titles and will reduce results to zero.
- Matching is a strict whitespace-tokenized substring (case-insensitive) over the title and id. EVERY token must match. There is no stemming or fuzzy matching, so word form matters — "embedding" does not match "embeddings".
- Prefer the singular root form ("embedding", not "embeddings"; "mangrove", not "mangroves").
- If a search returns 0 or very few hits, BROADEN — don't guess unrelated dataset names. Try, in parallel: the alternate singular/plural form, dropping a modifier, or a parent category term (e.g. "land cover" instead of "WorldCereal").
- Prefer firing 2-3 candidate variants as parallel tool calls rather than sequential single guesses; pick the best-matching result by title.`,
        parameters: {
            type: 'object',
            properties: {
                query: {type: 'string', description: 'Single distinctive dataset-identifying noun, in its root form (singular preferred). No years, regions, or AOI words.'},
                allowedTypes: {
                    type: 'array',
                    items: {type: 'string', enum: ['Image', 'ImageCollection', 'Table']},
                    description: 'Optional filter on asset type. Defaults to all types.'
                }
            },
            required: ['query']
        },
        handler: async ({username, params}) => {
            try {
                const result = await geeClient.searchDatasets({
                    username,
                    query: params.query,
                    allowedTypes: params.allowedTypes
                })
                return {success: true, data: result}
            } catch (error) {
                return {success: false, error: {code: 'GEE_SEARCH_FAILED', message: error.message}}
            }
        }
    }
]

module.exports = {createAssetTools}
