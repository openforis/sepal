import Ajv from 'ajv/dist/2020.js'
import addFormats from 'ajv-formats'

function createRecipeValidator(spec) {
    const ajv = new Ajv({allErrors: true, strict: false})
    addFormats(ajv)
    const schemaValidator = ajv.compile(spec.schema)

    return {validate}

    function validate(model) {
        return [...schemaErrors(model), ...ruleErrors(model)]
    }

    function schemaErrors(model) {
        if (schemaValidator(model)) return []
        return (schemaValidator.errors || []).map(error => ({
            path: error.instancePath || '',
            ...(error.keyword === 'required' && error.params?.missingProperty
                ? {missingProperty: error.params.missingProperty}
                : {}),
            message: error.message || 'schema error',
            rule: 'schema'
        }))
    }

    function ruleErrors(model) {
        return (spec.rules || []).flatMap(rule =>
            rule.validate(model).map(error => ({...error, rule: rule.name}))
        )
    }
}

export {createRecipeValidator}
