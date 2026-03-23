const aoiSchema = {
    type: 'object',
    description: 'Area of Interest definition',
    properties: {
        type: {
            type: 'string',
            enum: ['COUNTRY', 'EE_TABLE', 'POLYGON', 'POINT'],
            description: 'Type of AOI definition'
        },
        // COUNTRY type
        areaCode: {type: 'string', description: 'ISO country code (for COUNTRY type)'},
        countryCode: {type: 'string', description: 'ISO country code'},
        buffer: {type: 'number', description: 'Buffer in meters around the AOI'},
        // EE_TABLE type
        id: {type: 'string', description: 'Earth Engine table asset ID (for EE_TABLE type)'},
        column: {type: 'string', description: 'Column name for filtering'},
        value: {description: 'Column value for filtering'},
        // POLYGON type
        path: {
            type: 'array',
            description: 'Array of [lng, lat] coordinate pairs defining the polygon',
            items: {
                type: 'array',
                items: {type: 'number'},
                minItems: 2,
                maxItems: 2
            }
        },
        // POINT type
        lat: {type: 'number', description: 'Latitude'},
        lng: {type: 'number', description: 'Longitude'}
    },
    required: ['type']
}

module.exports = {aoiSchema}
