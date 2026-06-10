import {mergeMap, of} from 'rxjs'

import {getRecipeSpec} from '#sepal/recipes'

import {isChannelEmission} from '../channelEvents.js'
import {specialistPrompt} from '../llmText/prompts.js'
import {lookupRecipeMetadata$} from '../tools/recipeMetadata.js'
import {assembleSpecialistPrompt} from './assembleSpecialistPrompt.js'
import {answerOnly, createSpecialistRuntime} from './runSpecialist.js'
import {bindToolsToRecipe, scopeInnerTools} from './specialistScope.js'

const ALLOWED_INNER_TOOLS = ['recipe_load']
const RECIPE_BOUND_TOOLS = new Set(['recipe_load'])

const NOT_FOUND_ANSWER = 'I couldn\'t find that recipe. It may have been closed, deleted, or not loaded in this session.'
const LOOKUP_FAILED_ANSWER = 'I couldn\'t look up that recipe right now. Please try again.'

function describeRecipeTool({llm, bus, innerTools, guiRequests}) {
    const basePrompt = specialistPrompt('recipe')
    const scope = scopeInnerTools({innerTools, allowed: ALLOWED_INNER_TOOLS, label: 'describe_recipe'})
    const tools = {
        schemas: scope.allowedSchemas,
        invoke$: bindToolsToRecipe(scope.invokeTool$, {boundTools: RECIPE_BOUND_TOOLS})
    }

    return {
        name: 'describe_recipe',
        description: 'Describe ONE recipe -> concise prose, not raw model. Optional question narrows. Stateless; call again for follow-ups with the new question plus relevant prior context. Read-only: for edits call update_recipe directly, don\'t chain describe_recipe -> update_recipe.',
        directAnswer: true,
        parameters: {
            type: 'object',
            properties: {
                recipeId: {type: 'string'},
                question: {type: 'string'}
            },
            required: ['recipeId'],
            additionalProperties: false
        },
        invoke$: ({recipeId, question}, context) =>
            lookupRecipeMetadata$(guiRequests, context, recipeId).pipe(
                mergeMap(envelope => {
                    if (isChannelEmission(envelope)) return of(envelope)
                    if (envelope.ok === false) return of(preflightFailureEnvelope(envelope))
                    const spec = getRecipeSpec(envelope.data?.type)
                    const runtime = createSpecialistRuntime({
                        llm, bus,
                        name: 'recipe.describe',
                        systemPrompt: assembleSpecialistPrompt(basePrompt, spec, {purpose: 'describe'}),
                        tools
                    })
                    return runtime.consult$({
                        userText: buildDescribeUserText({recipeId, question}),
                        context: {...context, recipeId}
                    }).pipe(answerOnly())
                })
            )
    }
}

function preflightFailureEnvelope(envelope) {
    const answer = envelope.error?.code === 'RECIPE_NOT_FOUND' ? NOT_FOUND_ANSWER : LOOKUP_FAILED_ANSWER
    return {...envelope, error: {...envelope.error, answer}}
}

function buildDescribeUserText({recipeId, question}) {
    if (!question) return `recipeId: ${recipeId}`
    return `recipeId: ${recipeId}\nquestion: ${question}`
}

export {describeRecipeTool}
