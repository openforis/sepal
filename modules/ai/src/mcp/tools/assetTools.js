const {map, catchError, of} = require('rxjs')
const {isAbortError} = require('../../chat/abort')

const createAssetTools = ({geeClient}) => [
    {
        name: 'asset_search',
        description: `Search EE STAC catalog + Awesome GEE Community Datasets by free-text query. Resolves dataset name → asset id (e.g. "Hansen forest cover", "WorldCover", "Dynamic World"). Returns \`{matchingResults, gee:{matchingResults, moreResults, datasets:[{id, title, type, url}]}, community:{…}}\` — up to 10 per source. Report total \`matchingResults\` (+ \`moreResults\` if truncated). Some assets (e.g. global CCDC \`projects/CCDC/v4\`) aren't in the catalog — see ASSET_MOSAIC use cases.

Query construction:
- Dataset-identifying nouns ONLY (sensor, algorithm, product, dataset name). Single distinctive term preferred.
- NEVER include year/date/country/region/AOI — those are recipe params, not search terms. They reduce results to 0.
- Matching = whitespace-tokenized case-insensitive substring on title+id. Every token must match. No stemming — "embedding" ≠ "embeddings".
- Prefer singular root ("embedding", "mangrove").
- 0 or few hits → BROADEN, don't guess unrelated names. Try in parallel: alt singular/plural, drop a modifier, parent category (e.g. "land cover" not "WorldCereal").
- Prefer 2-3 variants as parallel calls over sequential single guesses; pick best title match.`,
        parameters: {
            type: 'object',
            properties: {
                query: {type: 'string', description: 'Single distinctive dataset-identifying noun, root form (singular). No years/regions/AOI.'},
                allowedTypes: {
                    type: 'array',
                    items: {type: 'string', enum: ['Image', 'ImageCollection', 'Table']},
                    description: 'Optional asset-type filter. Default: all.'
                }
            },
            required: ['query']
        },
        handler$: ({username, params}) =>
            geeClient.searchDatasets$({
                username,
                query: params.query,
                allowedTypes: params.allowedTypes
            }).pipe(
                map(data => ({success: true, data})),
                catchError(error => {
                    if (isAbortError(error)) throw error
                    return of({success: false, error: {code: 'GEE_SEARCH_FAILED', message: error.message}})
                })
            )
    }
]

module.exports = {createAssetTools}
