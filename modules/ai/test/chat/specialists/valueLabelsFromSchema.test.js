const {valueLabelsFromSchema} = require('#mcp/chat/specialists/valueLabelsFromSchema')

describe('valueLabelsFromSchema', () => {

    it('extracts enum labels from object and array-item enum fields', () => {
        const schema = {
            type: 'object',
            properties: {
                mode: {
                    enum: ['A', 'B'],
                    'x-enumLabels': {A: 'alpha', B: 'beta'}
                },
                methods: {
                    type: 'array',
                    items: {
                        enum: ['landsatCFMask'],
                        'x-enumLabels': {landsatCFMask: 'Landsat CFMask'}
                    }
                }
            }
        }

        expect(valueLabelsFromSchema(schema)).toContain('/mode: A(alpha)|B(beta)')
        expect(valueLabelsFromSchema(schema)).toContain('/methods: landsatCFMask(Landsat CFMask)')
    })

    it('resolves local refs and merges sibling descriptions/annotations', () => {
        const schema = {
            type: 'object',
            properties: {
                group: {$ref: '#/$defs/group'}
            },
            $defs: {
                group: {
                    type: 'object',
                    properties: {
                        type: {
                            enum: ['ALL'],
                            'x-enumLabels': {ALL: 'all scenes'}
                        }
                    }
                }
            }
        }

        expect(valueLabelsFromSchema(schema)).toContain('/group/type: ALL(all scenes)')
    })
})
