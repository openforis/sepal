const aoiSchema = {
    type: 'object',
    description: 'Area of Interest definition. Use type EE_TABLE with id "users/wiell/SepalResources/gaul" for countries/provinces, type EE_TABLE with a custom asset ID for Earth Engine tables, or type POLYGON with coordinate pairs.',
    properties: {
        type: {
            type: 'string',
            enum: ['EE_TABLE', 'POLYGON'],
            description: 'AOI type. Use EE_TABLE for countries, provinces, and Earth Engine table assets. Use POLYGON for custom drawn areas.'
        },
        // EE_TABLE type (covers both COUNTRY and custom EE tables)
        id: {
            type: 'string',
            description: 'Earth Engine table asset ID. For countries/provinces use "users/wiell/SepalResources/gaul".'
        },
        keyColumn: {
            type: 'string',
            description: 'Column name for filtering rows in the table. For countries use "id". Set to null to include all rows.'
        },
        key: {
            description: 'Value to match in keyColumn for filtering. For countries this is the country/area code (e.g. "KEN" for Kenya).'
        },
        level: {
            type: 'string',
            enum: ['COUNTRY', 'AREA'],
            description: 'Geographic level for country lookups. COUNTRY for entire country, AREA for province/state.'
        },
        buffer: {
            type: 'integer',
            minimum: 0,
            description: 'Buffer distance in meters around the AOI boundary.'
        },
        bounds: {
            type: 'object',
            description: 'Bounding box for the EE table geometry.'
        },
        // POLYGON type
        path: {
            type: 'array',
            description: 'Array of [lng, lat] coordinate pairs defining the polygon vertices.',
            items: {
                type: 'array',
                items: {type: 'number'},
                minItems: 2,
                maxItems: 2
            },
            minItems: 3
        }
    },
    required: ['type']
}

module.exports = {aoiSchema}
