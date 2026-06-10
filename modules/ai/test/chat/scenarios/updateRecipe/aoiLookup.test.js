import {of} from 'rxjs'

import {updateRecipeValuesTool} from '#mcp/chat/specialists/updateRecipe/updateRecipeValuesTool'
import {aoiTools} from '#mcp/chat/tools/aoiTools'
import {toEffectiveModel, validateRecipe} from '#recipes'

import {aFakeGuiRequests} from '../../builders.js'
import {aToolFactoryHarness, innerToolsImpl} from '../../harness.js'
import {aFullMosaicModel} from './fixtures.js'

// "Change the AOI to Italy" — AOI resolved through the specialist-private
// lookup. The GUI-returned aoi object is used verbatim; the model never
// hand-builds a country AOI. End-to-end through the real picker -> prepare
// -> updater -> update_recipe_values pipeline, asserting on the SEMANTIC
// final model.
const ITALY_AOI = {type: 'EE_TABLE', id: 'users/wiell/SepalResources/gaul', keyColumn: 'id', key: 122, level: 'COUNTRY', buffer: 0}
const LAZIO_AOI = {type: 'EE_TABLE', id: 'users/wiell/SepalResources/gaul', keyColumn: 'id', key: 1740, level: 'AREA', buffer: 0}

describe('"Change the AOI to Italy" — AOI resolved via specialist-private lookup', () => {

    it('patches /aoi with the GUI-returned aoi verbatim and produces a valid effective model', () => {
        const setup = aLiveMosaicSetupWithAoi({
            model: aFullMosaicModel(),
            countries: [{label: 'Italy', aoi: ITALY_AOI}]
        })
        const lookupCall = {id: 'tl1', name: 'aoi_list_countries', input: {query: 'Italy'}}
        const updateCall = {
            id: 'tu1', name: 'update_recipe_values',
            input: {recipeId: 'r1', values: {aoi: ITALY_AOI}}
        }
        const harness = aToolFactoryHarness({
            specialist: 'update_recipe',
            guiRequests: setup.guiRequests,
            innerTools: setup.innerTools,
            replies: [
                {text: '{"handles":["aoi"]}'},
                {toolCalls: [lookupCall]},
                {toolCalls: [updateCall]},
                {text: 'Updated AOI to Italy.'}
            ]
        })

        const result = harness.invoke({recipeId: 'r1', request: 'Change the AOI to Italy'})

        expect(result.ok).toBe(true)
        expect(setup.lookupRequests).toEqual([{action: 'list-countries', params: {}}])
        expect(setup.getCurrentModel().aoi).toEqual(ITALY_AOI)
        const aoiOps = setup.patchCalls.flatMap(call => call.params.operations).filter(op => op.path === '/aoi')
        expect(aoiOps).toHaveLength(1)
        expect(aoiOps[0].value).toEqual(ITALY_AOI)
        expect(validateRecipe('MOSAIC', toEffectiveModel('MOSAIC', setup.getCurrentModel()))).toEqual([])
    })

    it('chains country -> country-area lookup and patches /aoi with the AREA aoi verbatim', () => {
        const setup = aLiveMosaicSetupWithAoi({
            model: aFullMosaicModel(),
            countries: [{label: 'Italy', aoi: ITALY_AOI}],
            areasByCountry: {122: [{label: 'Lazio', aoi: LAZIO_AOI}]}
        })
        const countryCall = {id: 'tl1', name: 'aoi_list_countries', input: {query: 'Italy'}}
        const areaCall = {id: 'tl2', name: 'aoi_list_country_areas', input: {countryId: 122, query: 'Lazio'}}
        const updateCall = {
            id: 'tu1', name: 'update_recipe_values',
            input: {recipeId: 'r1', values: {aoi: LAZIO_AOI}}
        }
        const harness = aToolFactoryHarness({
            specialist: 'update_recipe',
            guiRequests: setup.guiRequests,
            innerTools: setup.innerTools,
            replies: [
                {text: '{"handles":["aoi"]}'},
                {toolCalls: [countryCall]},
                {toolCalls: [areaCall]},
                {toolCalls: [updateCall]},
                {text: 'Updated AOI to Lazio, Italy.'}
            ]
        })

        const result = harness.invoke({recipeId: 'r1', request: 'Change the AOI to Lazio, Italy'})

        expect(result.ok).toBe(true)
        expect(setup.lookupRequests).toEqual([
            {action: 'list-countries', params: {}},
            {action: 'list-country-areas', params: {countryId: 122}}
        ])
        expect(setup.getCurrentModel().aoi).toEqual(LAZIO_AOI)
        expect(setup.getCurrentModel().aoi.level).toBe('AREA')
        expect(validateRecipe('MOSAIC', toEffectiveModel('MOSAIC', setup.getCurrentModel()))).toEqual([])
    })

    it('asks ONE clarification when AOI lookup returns no match — and does not call GUI recipe-patch', () => {
        const setup = aLiveMosaicSetupWithAoi({
            model: aFullMosaicModel(),
            countries: []
        })
        const lookupCall = {id: 'tl1', name: 'aoi_list_countries', input: {query: 'Atlantis'}}
        const harness = aToolFactoryHarness({
            specialist: 'update_recipe',
            guiRequests: setup.guiRequests,
            innerTools: setup.innerTools,
            replies: [
                {text: '{"handles":["aoi"]}'},
                {toolCalls: [lookupCall]},
                {text: 'I couldn\'t find a country called Atlantis. Did you mean a different name, or do you want to send a polygon?'}
            ]
        })

        const result = harness.invoke({recipeId: 'r1', request: 'Change the AOI to Atlantis'})

        expect(result).toMatchObject({ok: false, error: {code: 'CLARIFICATION_NEEDED'}})
        expect(setup.patchCalls).toHaveLength(0)
    })
})

// Live setup mirroring aLiveMosaicSetup in fixtures.js, plus a list-countries
// response so the real aoi_list_countries tool returns scripted matches.
// Maintains a live in-memory MOSAIC model + modelHash through recipe-patch.
function aLiveMosaicSetupWithAoi({model, countries, areasByCountry = {}}) {
    const patchCalls = []
    const lookupRequests = []
    let currentModel = JSON.parse(JSON.stringify(model))
    let currentHash = 'h-base'
    const guiRequests = aFakeGuiRequests(request => {
        if (request.action === 'recipe-metadata') return of({id: 'r1', type: 'MOSAIC', name: 'Kenya'})
        if (request.action === 'load-recipe') return of({id: 'r1', type: 'MOSAIC', modelHash: currentHash, model: currentModel})
        if (request.action === 'list-countries') {
            lookupRequests.push({action: request.action, params: request.params})
            return of(countries)
        }
        if (request.action === 'list-country-areas') {
            lookupRequests.push({action: request.action, params: request.params})
            return of(areasByCountry[request.params.countryId] || [])
        }
        if (request.action === 'recipe-patch') {
            patchCalls.push(request)
            const projected = toEffectiveModel('MOSAIC', currentModel)
            currentModel = applyPatchOperations(projected, request.params.operations)
            currentHash = `h-${patchCalls.length + 1}`
            return of({summary: `Applied ${request.params.operations.length} operations`, modelHash: currentHash, invalidatedPaths: []})
        }
        return of({})
    })
    const realUpdate = updateRecipeValuesTool(guiRequests)
    const realAoi = aoiTools(guiRequests)
    const innerTools = innerToolsImpl(
        {
            update_recipe_values: (input, ctx) => realUpdate.invoke$(input, ctx),
            aoi_list_countries: (input, ctx) => realAoi.find(tool => tool.name === 'aoi_list_countries').invoke$(input, ctx),
            aoi_list_country_areas: (input, ctx) => realAoi.find(tool => tool.name === 'aoi_list_country_areas').invoke$(input, ctx)
        },
        [
            {
                name: 'update_recipe_values', description: 'Update.',
                parameters: {type: 'object', properties: {recipeId: {type: 'string'}, baseModelHash: {type: 'string'}, writableHandles: {type: 'array'}, values: {type: 'object'}}}
            },
            {name: 'aoi_list_countries', description: 'List countries.', parameters: {type: 'object', properties: {query: {type: 'string'}}}},
            {name: 'aoi_list_country_areas', description: 'List areas.', parameters: {type: 'object', properties: {countryId: {type: 'integer'}, query: {type: 'string'}}, required: ['countryId']}}
        ]
    )
    return {guiRequests, innerTools, patchCalls, lookupRequests, getCurrentModel: () => currentModel}
}

function applyPatchOperations(model, operations) {
    return operations.reduce(applyPatchOperation, JSON.parse(JSON.stringify(model)))
}

function applyPatchOperation(model, op) {
    const tokens = parsePointer(op.path)
    if (op.op === 'add' || op.op === 'replace') setAtPointer(model, tokens, op.value)
    else if (op.op === 'remove') removeAtPointer(model, tokens)
    else throw new Error(`Unsupported op in test patch applier: ${op.op}`)
    return model
}

function parsePointer(pointer) {
    if (pointer === '') return []
    if (!pointer.startsWith('/')) throw new Error(`bad pointer: ${pointer}`)
    return pointer.slice(1).split('/').map(token => token.replace(/~1/g, '/').replace(/~0/g, '~'))
}

function setAtPointer(model, tokens, value) {
    let node = model
    for (let i = 0; i < tokens.length - 1; i++) {
        if (!(tokens[i] in node)) node[tokens[i]] = {}
        node = node[tokens[i]]
    }
    node[tokens[tokens.length - 1]] = value
}

function removeAtPointer(model, tokens) {
    let node = model
    for (let i = 0; i < tokens.length - 1; i++) {
        node = node[tokens[i]]
        if (node == null) return
    }
    delete node[tokens[tokens.length - 1]]
}
