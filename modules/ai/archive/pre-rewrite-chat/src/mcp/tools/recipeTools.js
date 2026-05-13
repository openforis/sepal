const {randomUUID} = require('crypto')
const {of, defer, switchMap} = require('rxjs')
const {guiRequest$} = require('./guiRequest')

const GUI_WRITE_TIMEOUT_MS = 60000

const validationError = errors => ({
    success: false,
    error: {
        code: 'VALIDATION_ERROR',
        message: `Recipe model validation failed:\n${errors.join('\n')}`
    }
})

const validateRecipeModel = ({recipeValidator, type, model}) => {
    if (!recipeValidator) return null
    const errors = recipeValidator.validateModel({type, model})
    return errors ? validationError(errors) : null
}

const withId = entry => entry && typeof entry === 'object' && !entry.id
    ? {id: randomUUID(), ...entry}
    : entry

// LLM-supplied legend/constraint entries often omit `id` (the schema requires
// a UUID but the LLM can't generate one natively). Fill any missing ids on the
// known array paths before validation runs.
const fillModelIds = model => {
    if (!model || typeof model !== 'object') return model
    const result = {...model}
    if (result.legend?.entries) {
        result.legend = {
            ...result.legend,
            entries: result.legend.entries.map(entry => {
                const withEntryId = withId(entry)
                if (withEntryId?.constraints) {
                    return {...withEntryId, constraints: withEntryId.constraints.map(withId)}
                }
                return withEntryId
            })
        }
    }
    if (result.mask?.constraintsEntries) {
        result.mask = {
            ...result.mask,
            constraintsEntries: result.mask.constraintsEntries.map(entry => {
                const withEntryId = withId(entry)
                if (withEntryId?.constraints) {
                    return {...withEntryId, constraints: withEntryId.constraints.map(withId)}
                }
                return withEntryId
            })
        }
    }
    if (result.filter?.filtersEntries) {
        result.filter = {
            ...result.filter,
            filtersEntries: result.filter.filtersEntries.map(entry => {
                const withEntryId = withId(entry)
                if (withEntryId?.constraints) {
                    return {...withEntryId, constraints: withEntryId.constraints.map(withId)}
                }
                return withEntryId
            })
        }
    }
    return result
}

const createRecipeTools = ({recipeValidator, registry}) => {
    const recipeTypeIds = registry.listSchemas().map(s => s.id)
    return [{
        name: 'recipe_list',
        description: 'List user\'s saved recipes from GUI state. Optional filter by type / project.',
        parameters: {
            type: 'object',
            properties: {
                type: {type: 'string', enum: recipeTypeIds, description: 'Filter by recipe type id.'},
                projectId: {type: 'string', description: 'Filter by project id.'}
            }
        },
        handler$: ({params, request$}) =>
            guiRequest$(request$, 'list-recipes', params)
    },
    {
        name: 'recipe_load',
        description: 'Load a recipe\'s model (configuration, no UI state) by id.',
        parameters: {
            type: 'object',
            properties: {
                recipeId: {type: 'string', description: 'Recipe id.'}
            },
            required: ['recipeId']
        },
        handler$: ({params, request$}) =>
            guiRequest$(request$, 'load-recipe', {recipeId: params.recipeId})
    },
    {
        name: 'recipe_create',
        description: 'Create a recipe from a complete model. **Check `## Current Context` first**: iterating on an open same-type recipe → use recipe_save, not create. Workflow: recipe_info → start from defaults → modify needed fields → submit. Keep fields at defaults unless the prompt or domain knowledge justifies a change; update dependent fields together. GUI auto-opens — do NOT call recipe_open or ask "open it?". On timeout, check recipe_list before retrying to avoid duplicates.',
        parameters: {
            type: 'object',
            properties: {
                type: {type: 'string', enum: recipeTypeIds, description: 'Recipe type id.'},
                name: {type: 'string', description: 'REQUIRED. Concise display name derived from the request (e.g. "Bangladesh mangroves 2020 mosaic").'},
                projectId: {type: 'string', description: 'Project id. Resolution: (1) project the user named this conversation; (2) selected project IF the new recipe clearly follows existing recipes there — name it in the plan so the user can correct; (3) else ASK. Never silently pick.'},
                model: {type: 'object', description: 'Complete model from recipe_info.defaults + intentional changes.'}
            },
            required: ['type', 'name', 'model']
        },
        handler$: ({params, request$}) => {
            const model = fillModelIds(params.model)
            const invalid = validateRecipeModel({
                recipeValidator, type: params.type, model
            })
            if (invalid) return of(invalid)
            return guiRequest$(request$, 'create-recipe', {
                type: params.type,
                name: params.name,
                projectId: params.projectId,
                model
            }, {timeoutMs: GUI_WRITE_TIMEOUT_MS})
        }
    },
    {
        name: 'recipe_save',
        description: 'Update an existing recipe. Model fully REPLACES existing — no merging. Partial change workflow: recipe_load → modify → send back. GUI auto-opens; do NOT call recipe_open after.',
        parameters: {
            type: 'object',
            properties: {
                recipeId: {type: 'string', description: 'Recipe id.'},
                model: {type: 'object', description: 'Full new model. Replaces existing entirely.'}
            },
            required: ['recipeId', 'model']
        },
        handler$: ({params, request$}) =>
            guiRequest$(request$, 'load-recipe', {recipeId: params.recipeId}).pipe(
                switchMap(loaded => {
                    if (loaded.success === false) return of(loaded)
                    const model = fillModelIds(params.model)
                    const invalid = validateRecipeModel({
                        recipeValidator, type: loaded.data?.type, model
                    })
                    if (invalid) return of(invalid)
                    return guiRequest$(
                        request$,
                        'save-recipe',
                        {recipeId: params.recipeId, model},
                        {timeoutMs: GUI_WRITE_TIMEOUT_MS}
                    )
                })
            )
    },
    {
        name: 'recipe_delete',
        description: 'DESTRUCTIVE: permanently deletes the listed recipes. Always confirm with user first, naming each recipe.',
        parameters: {
            type: 'object',
            properties: {
                recipeIds: {
                    type: 'array',
                    items: {type: 'string'},
                    description: 'Recipe ids to delete (from recipe_list).'
                }
            },
            required: ['recipeIds']
        },
        handler$: ({params, request$}) =>
            guiRequest$(request$, 'delete-recipes', {recipeIds: params.recipeIds})
    },
    {
        name: 'recipe_move',
        description: 'Move recipes to a different project. If target ≠ selected project, ask before calling project_select. Never switch silently.',
        parameters: {
            type: 'object',
            properties: {
                recipeIds: {
                    type: 'array',
                    items: {type: 'string'},
                    description: 'Recipe ids to move.'
                },
                projectId: {type: 'string', description: 'Target project id.'}
            },
            required: ['recipeIds', 'projectId']
        },
        handler$: ({params, request$}) =>
            guiRequest$(request$, 'move-recipes', {recipeIds: params.recipeIds, projectId: params.projectId})
    },
    {
        name: 'recipe_open',
        description: 'Open a previously-saved recipe (typically from recipe_list). DO NOT call after recipe_create/recipe_save (auto-opens) or to apply changes — mutation tools update the open recipe live. If recipe\'s project ≠ selected project, ask before project_select.',
        parameters: {
            type: 'object',
            properties: {
                recipeId: {type: 'string', description: 'Recipe id to open.'}
            },
            required: ['recipeId']
        },
        handler$: ({params, send}) =>
            defer(() => {
                send({type: 'gui-action', action: 'open', params: {recipeId: params.recipeId}})
                return of({success: true, data: {action: 'open', recipeId: params.recipeId}})
            })
    },
    {
        name: 'recipe_close',
        description: 'Close a recipe tab. Only when the user explicitly asks. Never to "refresh"/"reset"/"apply" — mutation tools update the open recipe live. Close-then-reopen is wasted work.',
        parameters: {
            type: 'object',
            properties: {
                recipeId: {type: 'string', description: 'Recipe id to close.'}
            },
            required: ['recipeId']
        },
        handler$: ({params, send}) =>
            defer(() => {
                send({type: 'gui-action', action: 'close', params: {recipeId: params.recipeId}})
                return of({success: true, data: {action: 'close', recipeId: params.recipeId}})
            })
    }]
}

module.exports = {createRecipeTools}
