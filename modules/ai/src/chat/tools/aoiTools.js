const {mapData} = require('../channelEvents')
const {guiProductRequest$} = require('./guiProductRequest')

function aoiTools(guiRequests) {
    return [
        aoiListCountriesTool(guiRequests),
        aoiListCountryAreasTool(guiRequests)
    ]
}

function aoiListCountriesTool(guiRequests) {
    return {
        name: 'aoi_list_countries',
        description: 'Find country AOIs in the GUI country table. Returns [{label,aoi}], where aoi is a complete EE_TABLE value for the aoi handle. Always pass query when the user names a country. Use returned aoi verbatim; do not hand-build country AOIs.',
        parameters: {
            type: 'object',
            properties: {
                query: {type: 'string', description: 'Case-insensitive substring filter on country label.'}
            },
            additionalProperties: false
        },
        invoke$: (input, context) =>
            guiProductRequest$(guiRequests, context, 'list-countries', {}).pipe(
                mapData(applyLabelFilter(input.query))
            )
    }
}

function aoiListCountryAreasTool(guiRequests) {
    return {
        name: 'aoi_list_country_areas',
        description: 'Find sub-national AOIs for one country. Resolve countryId with aoi_list_countries first. Returns [{label,aoi}], where aoi is a complete EE_TABLE value for the aoi handle. Always pass query when the user names an area. Use returned aoi verbatim.',
        parameters: {
            type: 'object',
            properties: {
                countryId: {type: 'integer', description: 'Country id from aoi_list_countries result aoi.key.'},
                query: {type: 'string', description: 'Case-insensitive substring filter on area label.'}
            },
            required: ['countryId'],
            additionalProperties: false
        },
        invoke$: (input, context) =>
            guiProductRequest$(guiRequests, context, 'list-country-areas', {countryId: input.countryId}).pipe(
                mapData(applyLabelFilter(input.query))
            )
    }
}

function applyLabelFilter(query) {
    return rows => filterByLabel(rows, query)
}

function filterByLabel(rows, query) {
    if (!query || !Array.isArray(rows)) return rows
    const needle = query.toLowerCase()
    return rows.filter(row => row?.label?.toLowerCase().includes(needle))
}

module.exports = {aoiTools, aoiListCountriesTool, aoiListCountryAreasTool}
