import {llmMetadataFromSchema} from './llmMetadataFromSchema.js'

// Generic, recipe-agnostic: any object schema carrying a conditional
// `allOf: [{if: {properties:{trigger: contains const}}, then:{required:[...]}}]`
// (or a node-level if/then) becomes a constraint coupling the trigger path with
// its required companion paths, addressed by model-relative JSON Pointer.
describe('llmMetadataFromSchema — schema-conditional constraints', () => {

    function constraintsOf(schema) {
        return llmMetadataFromSchema(schema).constraints
    }

    it('couples a contains-triggered companion as a constraint over model-relative paths', () => {
        const schema = {
            type: 'object',
            properties: {
                group: {
                    type: 'object',
                    properties: {
                        mode: {type: 'array', items: {enum: ['A', 'B']}},
                        modeThreshold: {type: 'integer'}
                    },
                    allOf: [{
                        if: {properties: {mode: {type: 'array', contains: {const: 'A'}}}, required: ['mode']},
                        then: {required: ['modeThreshold']}
                    }]
                }
            }
        }

        const constraints = constraintsOf(schema)

        expect(constraints).toHaveLength(1)
        expect(constraints[0].paths.sort()).toEqual(['/group/mode', '/group/modeThreshold'])
    })

    it('names the constraint after the triggering field and value, and describes the requirement', () => {
        const schema = {
            type: 'object',
            properties: {
                group: {
                    type: 'object',
                    properties: {mode: {type: 'array', items: {enum: ['A']}}, modeThreshold: {type: 'integer'}},
                    allOf: [{
                        if: {properties: {mode: {type: 'array', contains: {const: 'A'}}}, required: ['mode']},
                        then: {required: ['modeThreshold']}
                    }]
                }
            }
        }

        const [constraint] = constraintsOf(schema)

        expect(constraint.name).toMatch(/group\.mode/)
        expect(constraint.name).toMatch(/A/)
        expect(constraint.description).toMatch(/modeThreshold/)
    })

    it('uses enum labels in descriptions while preserving raw values in names', () => {
        const schema = {
            type: 'object',
            properties: {
                methods: {
                    type: 'array',
                    items: {
                        enum: ['landsatCFMask'],
                        'x-enumLabels': {landsatCFMask: 'Landsat CFMask'}
                    }
                },
                cloud: {type: 'string'}
            },
            allOf: [{
                if: {properties: {methods: {contains: {const: 'landsatCFMask'}}}, required: ['methods']},
                then: {required: ['cloud']}
            }]
        }

        const [constraint] = constraintsOf(schema)

        expect(constraint.name).toContain('landsatCFMask')
        expect(constraint.description).toContain('Landsat CFMask (landsatCFMask)')
    })

    it('emits one constraint per conditional branch when several share a trigger field', () => {
        const schema = {
            type: 'object',
            properties: {
                methods: {type: 'array', items: {enum: ['x', 'y']}},
                xThreshold: {type: 'integer'},
                yBand: {type: 'string'}
            },
            allOf: [
                {if: {properties: {methods: {contains: {const: 'x'}}}, required: ['methods']}, then: {required: ['xThreshold']}},
                {if: {properties: {methods: {contains: {const: 'y'}}}, required: ['methods']}, then: {required: ['yBand']}}
            ]
        }

        const companions = constraintsOf(schema)
            .filter(c => c.paths.includes('/methods'))
            .flatMap(c => c.paths)

        expect(companions).toEqual(expect.arrayContaining(['/xThreshold', '/yBand']))
    })

    it('resolves a local $ref so the conditional is found at the referenced object', () => {
        const schema = {
            type: 'object',
            properties: {group: {$ref: '#/$defs/group'}},
            $defs: {
                group: {
                    type: 'object',
                    properties: {mode: {type: 'array', items: {enum: ['A']}}, modeThreshold: {type: 'integer'}},
                    allOf: [{
                        if: {properties: {mode: {contains: {const: 'A'}}}, required: ['mode']},
                        then: {required: ['modeThreshold']}
                    }]
                }
            }
        }

        const constraints = constraintsOf(schema)

        expect(constraints[0].paths.sort()).toEqual(['/group/mode', '/group/modeThreshold'])
    })

    it('exposes the then.required fields as subjectPaths (required-companion path; the rest are trigger/context)', () => {
        const schema = {
            type: 'object',
            properties: {
                group: {
                    type: 'object',
                    properties: {mode: {type: 'array', items: {enum: ['A']}}, modeThreshold: {type: 'integer'}, modeBand: {type: 'string'}},
                    allOf: [{
                        if: {properties: {mode: {type: 'array', contains: {const: 'A'}}}, required: ['mode']},
                        then: {required: ['modeThreshold', 'modeBand']}
                    }]
                }
            }
        }

        const [constraint] = constraintsOf(schema)

        expect(constraint.subjectPaths.sort()).toEqual(['/group/modeBand', '/group/modeThreshold'])
        // paths still carries trigger + subjects together, so existing readers stay valid.
        expect(constraint.paths).toEqual(expect.arrayContaining(['/group/mode', '/group/modeThreshold', '/group/modeBand']))
    })

    it('returns no constraints for a schema with no conditionals', () => {
        const schema = {type: 'object', properties: {a: {type: 'string'}, b: {type: 'integer'}}}

        expect(constraintsOf(schema)).toEqual([])
    })

    it('returns fresh objects each call so callers cannot corrupt later results', () => {
        const schema = {
            type: 'object',
            properties: {
                group: {
                    type: 'object',
                    properties: {mode: {type: 'array', items: {enum: ['A']}}, modeThreshold: {type: 'integer'}},
                    allOf: [{if: {properties: {mode: {contains: {const: 'A'}}}, required: ['mode']}, then: {required: ['modeThreshold']}}]
                }
            }
        }

        llmMetadataFromSchema(schema).constraints[0].paths.push('/injected')

        expect(llmMetadataFromSchema(schema).constraints[0].paths).not.toContain('/injected')
    })
})
