const {fieldShapeAt} = require('#mcp/chat/tools/fieldShapeFromSchema')

describe('fieldShapeAt', () => {

    const schema = {
        type: 'object',
        required: ['dates', 'options'],
        properties: {
            dates: {
                type: 'object',
                required: ['targetDate'],
                properties: {
                    targetDate: {type: 'string'},
                    yearsBefore: {type: 'number'}
                }
            },
            options: {
                type: 'object',
                required: ['corrections', 'filters'],
                properties: {
                    corrections: {type: 'array', items: {enum: ['SR', 'BRDF']}},
                    filters: {type: 'array', items: {type: 'object', properties: {type: {type: 'string'}}}},
                    coordinates: {type: 'array', items: {type: 'array'}},
                    note: {$ref: '#/$defs/text'}
                }
            },
            aoi: {
                oneOf: [
                    {type: 'object', properties: {type: {const: 'EE_TABLE'}}},
                    {type: 'object', properties: {type: {const: 'POLYGON'}}}
                ]
            },
            mixed: {
                oneOf: [
                    {type: 'object'},
                    {type: 'string'}
                ]
            }
        },
        $defs: {text: {type: 'string'}}
    }

    it('reports a scalar field and whether its parent requires it', () => {
        expect(fieldShapeAt(schema, '/dates/targetDate')).toEqual({valueKind: 'scalar', required: true})
        expect(fieldShapeAt(schema, '/dates/yearsBefore')).toEqual({valueKind: 'scalar', required: false})
    })

    it('classifies an enum-item array as a config array', () => {
        expect(fieldShapeAt(schema, '/options/corrections')).toEqual({valueKind: 'array', arrayKind: 'config', required: true})
    })

    it('classifies an array of objects or of arrays as a data array', () => {
        expect(fieldShapeAt(schema, '/options/filters')).toMatchObject({valueKind: 'array', arrayKind: 'data'})
        expect(fieldShapeAt(schema, '/options/coordinates')).toMatchObject({valueKind: 'array', arrayKind: 'data'})
    })

    it('reports object fields as object kind', () => {
        expect(fieldShapeAt(schema, '/options')).toMatchObject({valueKind: 'object', required: true})
    })

    it('infers object kind for oneOf fields when all variants are objects', () => {
        expect(fieldShapeAt(schema, '/aoi')).toMatchObject({valueKind: 'object'})
    })

    it('reports unknown kind for mixed oneOf fields', () => {
        expect(fieldShapeAt(schema, '/mixed')).toEqual({valueKind: 'unknown', required: false})
    })

    it('resolves $ref before classifying', () => {
        expect(fieldShapeAt(schema, '/options/note')).toMatchObject({valueKind: 'scalar'})
    })

    it('returns an unknown shape for a path the schema does not describe (e.g. an array value-name path)', () => {
        expect(fieldShapeAt(schema, '/options/corrections/SR')).toEqual({valueKind: 'unknown', required: false})
    })
})
