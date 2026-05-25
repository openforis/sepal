// Test fixtures + builders for the updateRecipe scenario suite.
//
//   metadataFor / *Metadata  — recipe-metadata + load-recipe doubles that hand
//                              a workflow a constant recipe (no patch state).
//   aLiveMosaicSetup         — recipe-metadata + load-recipe + recipe-patch
//                              that maintain a live in-memory MOSAIC model
//                              across recipe_patch calls. Lets scenario tests
//                              assert on the SEMANTIC final model after one
//                              or more handle-keyed updates flow through the
//                              real update_recipe_values tool.

const {of} = require('rxjs')
const {aFakeGuiRequests, innerToolsImpl} = require('../../harness')
const {updateRecipeValuesTool} = require('#mcp/chat/specialists/updateRecipe/updateRecipeValuesTool')

const mosaicMetadata = {id: 'r1', type: 'MOSAIC', name: 'Kenya mosaic', projectId: 'p1'}
const unspeccedMetadata = {id: 'r-other', type: 'NOT_IN_REGISTRY', name: 'Other', projectId: 'p1'}

function metadataFor(metadata) {
    return aFakeGuiRequests(request => {
        if (request.action === 'recipe-metadata') return of(metadata)
        if (request.action === 'load-recipe') return of({id: metadata.id, type: metadata.type, modelHash: 'h-base', model: defaultMosaicModel()})
        return of(metadata)
    })
}

function defaultMosaicModel() {
    return {
        dates: {type: 'YEARLY_TIME_SCAN', targetDate: '2024-07-02', seasonStart: '2024-01-01', seasonEnd: '2025-01-01', yearsBefore: 0, yearsAfter: 0},
        sources: {cloudPercentageThreshold: 75, dataSets: {LANDSAT: ['LANDSAT_9']}},
        sceneSelectionOptions: {type: 'ALL', targetDateWeight: 0},
        compositeOptions: {
            corrections: ['SR', 'BRDF'], brdfMultiplier: 4, filters: [],
            orbitOverlap: 'KEEP', tileOverlap: 'QUICK_REMOVE',
            includedCloudMasking: ['sepalCloudScore', 'landsatCFMask'],
            landsatCFMaskCloudMasking: 'MODERATE', landsatCFMaskCloudShadowMasking: 'MODERATE',
            landsatCFMaskCirrusMasking: 'MODERATE', landsatCFMaskDilatedCloud: 'REMOVE',
            sepalCloudScoreMaxCloudProbability: 30,
            cloudBuffer: 0, holes: 'ALLOW', snowMasking: 'ON', compose: 'MEDOID'
        }
    }
}

function aFullMosaicModel(overrides = {}) {
    const base = {
        dates: {type: 'YEARLY_TIME_SCAN', targetDate: '2024-07-02', seasonStart: '2024-01-01', seasonEnd: '2025-01-01', yearsBefore: 0, yearsAfter: 0},
        sources: {cloudPercentageThreshold: 75, dataSets: {LANDSAT: ['LANDSAT_9'], SENTINEL_2: ['SENTINEL_2']}},
        sceneSelectionOptions: {type: 'ALL', targetDateWeight: 0},
        compositeOptions: {
            corrections: ['CALIBRATE', 'BRDF'], brdfMultiplier: 4, filters: [],
            orbitOverlap: 'KEEP', tileOverlap: 'QUICK_REMOVE',
            includedCloudMasking: ['sepalCloudScore', 'landsatCFMask', 'sentinel2CloudScorePlus'],
            landsatCFMaskCloudMasking: 'MODERATE', landsatCFMaskCloudShadowMasking: 'MODERATE',
            landsatCFMaskCirrusMasking: 'MODERATE', landsatCFMaskDilatedCloud: 'REMOVE',
            sepalCloudScoreMaxCloudProbability: 30,
            sentinel2CloudScorePlusBand: 'cs_cdf', sentinel2CloudScorePlusMaxCloudProbability: 45,
            cloudBuffer: 0, holes: 'ALLOW', snowMasking: 'ON', compose: 'MEDOID'
        },
        aoi: {type: 'POLYGON', path: [[36.7, -1.4], [36.8, -1.4], [36.8, -1.3]]}
    }
    return {...base, ...overrides, compositeOptions: {...base.compositeOptions, ...(overrides.compositeOptions || {})}}
}

function aLiveMosaicSetup({model}) {
    const patchCalls = []
    let currentModel = JSON.parse(JSON.stringify(model))
    let currentHash = 'h-base'
    const guiRequests = aFakeGuiRequests(request => {
        if (request.action === 'recipe-metadata') return of({id: 'r1', type: 'MOSAIC', name: 'Kenya'})
        if (request.action === 'load-recipe') return of({id: 'r1', type: 'MOSAIC', modelHash: currentHash, model: currentModel})
        if (request.action === 'recipe-patch') {
            patchCalls.push(request)
            currentModel = applyPatchOperations(currentModel, request.params.operations)
            currentHash = `h-${patchCalls.length + 1}`
            return of({summary: `Applied ${request.params.operations.length} operations`, modelHash: currentHash, invalidatedPaths: []})
        }
        return of({})
    })
    const innerTools = innerToolsImpl(
        {update_recipe_values: (input, context) => updateRecipeValuesTool(guiRequests).invoke$(input, context)},
        [{
            name: 'update_recipe_values',
            description: 'Update.',
            parameters: {type: 'object', properties: {recipeId: {type: 'string'}, baseModelHash: {type: 'string'}, writableHandles: {type: 'array'}, values: {type: 'object'}}}
        }]
    )
    return {guiRequests, innerTools, patchCalls, getCurrentModel: () => currentModel}
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

module.exports = {metadataFor, mosaicMetadata, unspeccedMetadata, aFullMosaicModel, aLiveMosaicSetup}
