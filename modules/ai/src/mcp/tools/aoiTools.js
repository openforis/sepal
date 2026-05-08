const {guiRequest} = require('./guiRequest')

const filterByLabel = (data, query) => {
    if (!query || !Array.isArray(data)) return data
    const needle = query.toLowerCase()
    return data.filter(entry => entry?.label?.toLowerCase().includes(needle))
}

const createAoiTools = () => [
    {
        name: 'aoi_list_countries',
        description: 'List countries as AOIs. Returns `[{label, aoi}]`; aoi is a fully-formed EE_TABLE AOI ready to drop into `model.aoi`. `aoi.key` = FAO GAUL ADM_CODE (integer, e.g. 73 = Ecuador) — NOT ISO alpha-3. ALWAYS pass `query` when user names a country; full list (~276) swamps context. Use returned aoi verbatim — never hand-construct.',
        parameters: {
            type: 'object',
            properties: {
                query: {type: 'string', description: 'Case-insensitive substring filter on label. Use whenever user names a country. Omit only when user explicitly asks for full list.'}
            }
        },
        handler: async ({params, request}) => {
            const result = await guiRequest(request, 'list-countries', {}, {timeoutMs: 30000})
            return result.success === false
                ? result
                : {success: true, data: filterByLabel(result.data, params.query)}
        }
    },
    {
        name: 'aoi_list_country_areas',
        description: 'List sub-national areas (provinces/states/regions) of a country. Returns `[{label, aoi}]`; aoi is a fully-formed EE_TABLE AOI ready for `model.aoi`. `aoi.key` = area GAUL ADM_CODE. Resolve countryId via aoi_list_countries first (its aoi.key is countryId, as integer). ALWAYS pass `query` when user names an area. Use returned aoi verbatim.',
        parameters: {
            type: 'object',
            properties: {
                countryId: {type: 'integer', description: 'Country ADM_CODE from aoi_list_countries (`aoi.key`).'},
                query: {type: 'string', description: 'Case-insensitive substring filter on area label. Use whenever user names an area.'}
            },
            required: ['countryId']
        },
        handler: async ({params, request}) => {
            const result = await guiRequest(
                request,
                'list-country-areas',
                {countryId: params.countryId},
                {timeoutMs: 30000}
            )
            return result.success === false
                ? result
                : {success: true, data: filterByLabel(result.data, params.query)}
        }
    }
]

module.exports = {createAoiTools}
