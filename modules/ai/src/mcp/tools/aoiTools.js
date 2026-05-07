const filterByLabel = (data, query) => {
    if (!query || !Array.isArray(data)) return data
    const needle = query.toLowerCase()
    return data.filter(entry => entry?.label?.toLowerCase().includes(needle))
}

const createAoiTools = () => [
    {
        name: 'aoi_list_countries',
        description: 'List countries available as AOIs. Returns an array of {label, aoi} where label is the country name and aoi is a fully-formed EE_TABLE AOI object ready to drop into a recipe model under `model.aoi`. The aoi.key field is the integer FAO GAUL ADM_CODE (e.g. 73 for Ecuador) — not an ISO alpha-3 code. ALWAYS pass `query` when the user names a specific country — the unfiltered list has ~276 entries and will swamp small-model context. Match the user\'s named country to a returned label, then use the corresponding aoi verbatim — do not hand-construct the AOI envelope. To request the country with a buffer, override the buffer field on the returned aoi.',
        parameters: {
            type: 'object',
            properties: {
                query: {type: 'string', description: 'Case-insensitive substring filter on the country label. Use whenever the user names a specific country (e.g. query: "san marino"). Omit only when the user explicitly asks for the full list.'}
            }
        },
        handler: async ({params, request}) => {
            try {
                const data = await request({type: 'gui-action', action: 'list-countries'}, {timeoutMs: 30000})
                return {success: true, data: filterByLabel(data, params.query)}
            } catch (error) {
                return {success: false, error: {code: 'GUI_REQUEST_FAILED', message: error.message}}
            }
        }
    },
    {
        name: 'aoi_list_country_areas',
        description: 'List sub-national areas (provinces/states/regions) of a country. Returns an array of {label, aoi} where aoi is a fully-formed EE_TABLE AOI for that area, ready to drop into a recipe model under `model.aoi`. The aoi.key is the integer GAUL ADM_CODE for the area. Resolve countryId via aoi_list_countries first (the country aoi.key is the countryId — pass it as a number). ALWAYS pass `query` when the user names a specific area, to avoid swamping context with the full per-country list. Match the user\'s named area to a returned label and use the corresponding aoi verbatim.',
        parameters: {
            type: 'object',
            properties: {
                countryId: {type: 'integer', description: 'Country ADM_CODE from aoi_list_countries (the aoi.key field of the country entry, e.g. 73 for Ecuador).'},
                query: {type: 'string', description: 'Case-insensitive substring filter on the area label. Use whenever the user names a specific area.'}
            },
            required: ['countryId']
        },
        handler: async ({params, request}) => {
            try {
                const data = await request(
                    {type: 'gui-action', action: 'list-country-areas', countryId: params.countryId},
                    {timeoutMs: 30000}
                )
                return {success: true, data: filterByLabel(data, params.query)}
            } catch (error) {
                return {success: false, error: {code: 'GUI_REQUEST_FAILED', message: error.message}}
            }
        }
    }
]

module.exports = {createAoiTools}
