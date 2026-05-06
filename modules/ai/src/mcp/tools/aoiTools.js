const createAoiTools = () => [
    {
        name: 'aoi_list_countries',
        description: 'List all countries available as AOIs. Returns an array of {label, aoi} where label is the human-readable country name and aoi is a fully-formed EE_TABLE AOI object ready to drop into a recipe model under `model.aoi`. Match the user\'s named country to a label, then use the corresponding aoi verbatim — do not hand-construct the AOI envelope. The browser must be connected; the list is cached in the GUI after the first load. To request the country with a buffer, override the buffer field on the returned aoi.',
        parameters: {
            type: 'object',
            properties: {}
        },
        handler: async ({request}) => {
            try {
                const data = await request({type: 'gui-action', action: 'list-countries'}, {timeoutMs: 30000})
                return {success: true, data}
            } catch (error) {
                return {success: false, error: {code: 'GUI_REQUEST_FAILED', message: error.message}}
            }
        }
    },
    {
        name: 'aoi_list_country_areas',
        description: 'List the sub-national areas (provinces/states/regions) of a country. Returns an array of {label, aoi} where aoi is a fully-formed EE_TABLE AOI for that area, ready to drop into a recipe model under `model.aoi`. Resolve the countryId via aoi_list_countries first (the country aoi.key is the countryId). Match the user\'s named area to a label and use the corresponding aoi verbatim. The browser must be connected; the per-country list is cached in the GUI after the first load.',
        parameters: {
            type: 'object',
            properties: {
                countryId: {type: 'string', description: 'Country code from aoi_list_countries (the aoi.key field of the country entry, e.g. "ECU").'}
            },
            required: ['countryId']
        },
        handler: async ({params, request}) => {
            try {
                const data = await request(
                    {type: 'gui-action', action: 'list-country-areas', countryId: params.countryId},
                    {timeoutMs: 30000}
                )
                return {success: true, data}
            } catch (error) {
                return {success: false, error: {code: 'GUI_REQUEST_FAILED', message: error.message}}
            }
        }
    }
]

module.exports = {createAoiTools}
