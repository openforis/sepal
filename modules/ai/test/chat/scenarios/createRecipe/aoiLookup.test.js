import {of} from 'rxjs'

import {createRecipeValuesTool} from '#mcp/chat/specialists/createRecipe/createRecipeValuesTool'
import {aoiTools} from '#mcp/chat/tools/aoiTools'
import {toEffectiveModel, validateRecipe} from '#recipes'

import {aFakeGuiRequests} from '../../builders.js'
import {aToolFactoryHarness, innerToolsImpl} from '../../harness.js'

// "Create a mosaic over Italy" — AOI resolved through the specialist-private
// AOI lookup tool. The GUI-returned aoi object is used verbatim; the model
// never hand-builds it. End-to-end through the real picker -> prepare ->
// updater -> create_recipe_values pipeline, asserting on the SEMANTIC final
// model handed to the GUI (not internal patch ops).
const ITALY_AOI = {type: 'EE_TABLE', id: 'users/wiell/SepalResources/gaul', keyColumn: 'id', key: 122, level: 'COUNTRY', buffer: 0}

describe('"Create a mosaic over Italy" — AOI resolved via specialist-private lookup', () => {

    it('uses the GUI-returned aoi verbatim in the submitted effective model and never invents polygon coordinates', () => {
        const setup = aLiveCreateSetupWithAoi({countries: [{label: 'Italy', aoi: ITALY_AOI}]})
        const lookupCall = {id: 'tl1', name: 'aoi_list_countries', input: {query: 'Italy'}}
        const createCall = {id: 'tc1', name: 'create_recipe_values', input: {values: {aoi: ITALY_AOI}}}
        const harness = aToolFactoryHarness({
            specialist: 'create_recipe',
            innerTools: setup.innerTools,
            replies: [
                {text: '{"handles":["aoi"]}'},
                {toolCalls: [lookupCall]},
                {toolCalls: [createCall]},
                {text: 'Created Italy MOSAIC.'}
            ]
        })

        const result = harness.invoke({
            recipeType: 'MOSAIC', instruction: 'Create a mosaic over Italy',
            projectId: 'p1', name: 'Italy'
        })

        expect(result.ok).toBe(true)
        expect(setup.lookupRequests).toEqual([{action: 'list-countries', params: {}}])
        const submittedModel = setup.getSubmittedModel()
        expect(submittedModel.aoi).toEqual(ITALY_AOI)
        expect(validateRecipe('MOSAIC', toEffectiveModel('MOSAIC', submittedModel))).toEqual([])
    })

    it('asks ONE clarification when AOI lookup returns no match — and does not call GUI create-recipe', () => {
        const setup = aLiveCreateSetupWithAoi({countries: []})
        const lookupCall = {id: 'tl1', name: 'aoi_list_countries', input: {query: 'Atlantis'}}
        const harness = aToolFactoryHarness({
            specialist: 'create_recipe',
            innerTools: setup.innerTools,
            replies: [
                {text: '{"handles":["aoi"]}'},
                {toolCalls: [lookupCall]},
                {text: 'I couldn\'t find a country called Atlantis. Send a polygon or pick a known country/region.'}
            ]
        })

        const result = harness.invoke({
            recipeType: 'MOSAIC', instruction: 'Create a mosaic of Atlantis',
            projectId: 'p1', name: 'Atlantis'
        })

        expect(result).toMatchObject({
            ok: false,
            error: {code: 'CLARIFICATION_NEEDED', answer: expect.stringMatching(/atlantis|country|polygon/i)}
        })
        expect(setup.createCalls).toHaveLength(0)
    })
})

// Live setup: real create_recipe_values + real aoi_list_countries tools, GUI
// handler that returns scripted country matches and records the submitted
// model. Returns hooks for semantic assertions on what reached the GUI.
function aLiveCreateSetupWithAoi({countries}) {
    const createCalls = []
    const lookupRequests = []
    let submittedModel = null
    const guiRequests = aFakeGuiRequests(request => {
        if (request.action === 'list-countries') {
            lookupRequests.push({action: request.action, params: request.params})
            return of(countries)
        }
        if (request.action === 'create-recipe') {
            createCalls.push(request)
            submittedModel = request.params.model
            return of({summary: 'created', recipeId: 'r-new', type: request.params.type, name: request.params.name, projectId: request.params.projectId})
        }
        return of({})
    })
    const realCreateTool = createRecipeValuesTool(guiRequests)
    const realAoi = aoiTools(guiRequests)
    const innerTools = innerToolsImpl(
        {
            create_recipe_values: (input, ctx) => realCreateTool.invoke$(input, ctx),
            aoi_list_countries: (input, ctx) => realAoi.find(tool => tool.name === 'aoi_list_countries').invoke$(input, ctx),
            aoi_list_country_areas: (input, ctx) => realAoi.find(tool => tool.name === 'aoi_list_country_areas').invoke$(input, ctx)
        },
        [
            {
                name: 'create_recipe_values', description: 'Create.',
                parameters: {
                    type: 'object',
                    properties: {recipeType: {type: 'string'}, projectId: {type: 'string'}, name: {type: 'string'}, writableHandles: {type: 'array'}, values: {type: 'object'}},
                    required: ['recipeType', 'writableHandles', 'values']
                }
            },
            {name: 'aoi_list_countries', description: 'List countries.', parameters: {type: 'object', properties: {query: {type: 'string'}}}},
            {name: 'aoi_list_country_areas', description: 'List areas.', parameters: {type: 'object', properties: {countryId: {type: 'integer'}, query: {type: 'string'}}, required: ['countryId']}}
        ]
    )
    return {guiRequests, innerTools, createCalls, lookupRequests, getSubmittedModel: () => submittedModel}
}
