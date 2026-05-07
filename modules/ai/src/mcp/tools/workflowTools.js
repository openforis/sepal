const _ = require('lodash')
const {v4: uuid} = require('uuid')
const log = require('#sepal/log').getLogger('tools')

const createWorkflowTools = ({registry, recipeClient, recipeValidator}) => [
    {
        name: 'workflow_start',
        description: 'Begin guided step-by-step recipe creation. Returns first step with field descriptions.',
        parameters: {
            type: 'object',
            properties: {
                type: {type: 'string', description: 'Recipe type (e.g. MOSAIC, CLASSIFICATION).'}
            },
            required: ['type']
        },
        handler: async ({params, session}) => {
            const schema = registry.getSchema(params.type)
            if (!schema) {
                return {success: false, error: {code: 'UNKNOWN_TYPE', message: `Unknown recipe type: ${params.type}`}}
            }
            if (!schema.workflowSteps || schema.workflowSteps.length === 0) {
                return {success: false, error: {code: 'NO_WORKFLOW', message: `No guided workflow defined for ${params.type}`}}
            }

            const workflowId = uuid()
            const workflow = {
                id: workflowId,
                type: params.type,
                steps: schema.workflowSteps,
                currentStepIndex: 0,
                values: {},
                completed: false
            }

            session.workflow = workflow

            const firstStep = schema.workflowSteps[0]
            const stepFields = {}
            for (const field of firstStep.fields) {
                if (schema.parameterSchema.properties[field]) {
                    stepFields[field] = schema.parameterSchema.properties[field]
                }
            }

            return {
                success: true,
                data: {
                    workflowId,
                    step: {
                        id: firstStep.id,
                        name: firstStep.name,
                        description: firstStep.description,
                        fields: stepFields,
                        stepNumber: 1,
                        totalSteps: schema.workflowSteps.length
                    }
                }
            }
        }
    },
    {
        name: 'workflow_step',
        description: 'Submit current step values and advance to next.',
        parameters: {
            type: 'object',
            properties: {
                workflowId: {type: 'string', description: 'Workflow id.'},
                stepId: {type: 'string', description: 'Step id being submitted.'},
                values: {type: 'object', description: 'Field values for this step.'}
            },
            required: ['workflowId', 'stepId', 'values']
        },
        handler: async ({params, session}) => {
            const workflow = session.workflow
            if (!workflow || workflow.id !== params.workflowId) {
                return {success: false, error: {code: 'INVALID_WORKFLOW', message: 'Workflow not found or expired'}}
            }

            const currentStep = workflow.steps[workflow.currentStepIndex]
            if (currentStep.id !== params.stepId) {
                return {success: false, error: {code: 'WRONG_STEP', message: `Expected step "${currentStep.id}", got "${params.stepId}"`}}
            }

            // Store values
            Object.assign(workflow.values, params.values)
            workflow.currentStepIndex++

            const schema = registry.getSchema(workflow.type)

            if (workflow.currentStepIndex >= workflow.steps.length) {
                workflow.completed = true
                return {
                    success: true,
                    data: {
                        workflowId: workflow.id,
                        completed: true,
                        message: 'All steps completed. Use workflow_complete to create the recipe.'
                    }
                }
            }

            const nextStep = workflow.steps[workflow.currentStepIndex]
            const stepFields = {}
            for (const field of nextStep.fields) {
                if (schema.parameterSchema.properties[field]) {
                    stepFields[field] = schema.parameterSchema.properties[field]
                }
            }

            return {
                success: true,
                data: {
                    workflowId: workflow.id,
                    step: {
                        id: nextStep.id,
                        name: nextStep.name,
                        description: nextStep.description,
                        fields: stepFields,
                        stepNumber: workflow.currentStepIndex + 1,
                        totalSteps: workflow.steps.length
                    }
                }
            }
        }
    },
    {
        name: 'workflow_status',
        description: 'Get workflow state — completed and remaining steps.',
        parameters: {
            type: 'object',
            properties: {
                workflowId: {type: 'string', description: 'Workflow id.'}
            },
            required: ['workflowId']
        },
        handler: async ({params, session}) => {
            const workflow = session.workflow
            if (!workflow || workflow.id !== params.workflowId) {
                return {success: false, error: {code: 'INVALID_WORKFLOW', message: 'Workflow not found or expired'}}
            }

            return {
                success: true,
                data: {
                    workflowId: workflow.id,
                    type: workflow.type,
                    currentStepIndex: workflow.currentStepIndex,
                    totalSteps: workflow.steps.length,
                    completed: workflow.completed,
                    completedSteps: workflow.steps.slice(0, workflow.currentStepIndex).map(s => s.id),
                    remainingSteps: workflow.steps.slice(workflow.currentStepIndex).map(s => ({id: s.id, name: s.name})),
                    collectedValues: workflow.values
                }
            }
        }
    },
    {
        name: 'workflow_complete',
        description: 'Finalize a completed workflow; create the recipe.',
        parameters: {
            type: 'object',
            properties: {
                workflowId: {type: 'string', description: 'Workflow id.'},
                name: {type: 'string', description: 'New recipe name.'},
                projectId: {type: 'string', description: 'Target project id.'}
            },
            required: ['workflowId']
        },
        handler: async ({username, params, session}) => {
            const workflow = session.workflow
            if (!workflow || workflow.id !== params.workflowId) {
                return {success: false, error: {code: 'INVALID_WORKFLOW', message: 'Workflow not found or expired'}}
            }
            if (!workflow.completed) {
                return {success: false, error: {code: 'INCOMPLETE', message: 'Workflow has not completed all steps yet'}}
            }

            const name = params.name || `${workflow.type} recipe`
            let model = workflow.values
            if (recipeValidator) {
                const errors = recipeValidator.validateModel({type: workflow.type, model})
                if (errors) {
                    return {
                        success: false,
                        error: {
                            code: 'VALIDATION_ERROR',
                            message: `Recipe model validation failed:\n${errors.join('\n')}`
                        }
                    }
                }
            }
            const result = await recipeClient.saveRecipe({
                username,
                type: workflow.type,
                name,
                projectId: params.projectId,
                model
            })

            session.workflow = null

            return {success: true, data: result}
        }
    },
    {
        name: 'workflow_cancel',
        description: 'Cancel an in-progress workflow.',
        parameters: {
            type: 'object',
            properties: {
                workflowId: {type: 'string', description: 'Workflow id to cancel.'}
            },
            required: ['workflowId']
        },
        handler: async ({params, session}) => {
            const workflow = session.workflow
            if (!workflow || workflow.id !== params.workflowId) {
                return {success: false, error: {code: 'INVALID_WORKFLOW', message: 'Workflow not found or expired'}}
            }
            session.workflow = null
            return {success: true, data: {cancelled: true}}
        }
    }
]

module.exports = {createWorkflowTools}
