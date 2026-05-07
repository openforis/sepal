import {select} from '~/store'
import {msg} from '~/translate'

import {loadProjects$, loadRecipes$} from '../process/recipe'

const humanize = toolName =>
    toolName.replace(/_/g, ' ').replace(/^\w/, c => c.toUpperCase())

const recipeTypeName = type =>
    type ? msg(`tasks.details.recipeTypeNames.${type}`, {}, type) : ''

const translateToolName = toolName =>
    msg(`home.chat.tools.${toolName}.label`, {}, humanize(toolName))

let recipesLoading = false
let projectsLoading = false

const ensureRecipes = () => {
    if (recipesLoading || select('process.recipes')) return
    recipesLoading = true
    loadRecipes$().subscribe({complete: () => { recipesLoading = false }})
}

const ensureProjects = () => {
    if (projectsLoading || select('process.projects')) return
    projectsLoading = true
    loadProjects$().subscribe({complete: () => { projectsLoading = false }})
}

const projectName = projectId => {
    if (!projectId) return ''
    const projects = select('process.projects')
    if (!projects) {
        ensureProjects()
        return ''
    }
    return projects.find(p => p.id === projectId)?.name || ''
}

const recipeRef = recipeId => {
    if (!recipeId) return ''
    const recipes = select('process.recipes')
    if (!recipes) {
        ensureRecipes()
        ensureProjects()
        return ''
    }
    const saved = recipes.find(r => r.id === recipeId)
    const loaded = (select('process.loadedRecipes') || {})[recipeId]
    const recipe = saved || loaded
    if (!recipe) return ''
    const proj = projectName(recipe.projectId)
    const name = recipe.name || recipe.title || ''
    return proj ? `${proj}/${name}` : name
}

const recipeRefs = ids =>
    (ids || []).map(recipeRef).filter(Boolean).join(', ')

const tr = (toolName, slot, args) =>
    msg(`home.chat.tools.${toolName}.${slot}`, args, '')

const maybeProject = projectId => {
    const project = projectName(projectId)
    return project ? tr('shared', 'inProject', {project}) : ''
}

const listRecipeLabel = type =>
    type
        ? tr('recipe_list', 'labelWithType', {type: recipeTypeName(type)})
        : null

const formatters = {
    recipe_create: {
        label: ({type}) => type ? tr('recipe_create', 'labelWithType', {type: recipeTypeName(type)}) : null,
        input: ({type, name, projectId}) => tr('recipe_create', 'input', {
            type: recipeTypeName(type), name: name || '', project: maybeProject(projectId)
        }).trim(),
        result: data => tr('recipe_create', 'result', {
            type: recipeTypeName(data?.type), name: data?.name || '', project: projectName(data?.projectId)
        })
    },
    recipe_save: {
        input: ({recipeId}) => tr('recipe_save', 'input', {recipe: recipeRef(recipeId)}),
        result: data => tr('recipe_save', 'result', {recipe: recipeRef(data?.id)})
    },
    recipe_load: {
        input: ({recipeId}) => tr('recipe_load', 'input', {recipe: recipeRef(recipeId)}),
        result: data => tr('recipe_load', 'result', {recipe: recipeRef(data?.id) || data?.title || ''})
    },
    recipe_list: {
        label: ({type}) => listRecipeLabel(type),
        input: ({type, projectId}) => tr('recipe_list', 'input', {
            type: recipeTypeName(type), project: maybeProject(projectId)
        }),
        result: data => tr('recipe_list', 'result', {count: Array.isArray(data) ? data.length : 0})
    },
    recipe_delete: {
        input: ({recipeIds}) => tr('recipe_delete', 'input', {
            count: recipeIds?.length ?? 0, recipes: recipeRefs(recipeIds)
        }),
        result: data => tr('recipe_delete', 'result', {count: data?.deleted?.length ?? 0})
    },
    recipe_move: {
        input: ({recipeIds, projectId}) => tr('recipe_move', 'input', {
            count: recipeIds?.length ?? 0, project: projectName(projectId)
        }),
        result: data => tr('recipe_move', 'result', {
            count: data?.moved?.length ?? 0, project: projectName(data?.projectId)
        })
    },
    project_create: {
        input: ({name}) => tr('project_create', 'input', {name: name || ''}),
        result: data => tr('project_create', 'result', {name: data?.name || ''})
    },
    project_list: {
        result: data => tr('project_list', 'result', {count: Array.isArray(data) ? data.length : 0})
    },
    project_delete: {
        input: ({projectId}) => tr('project_delete', 'input', {project: projectName(projectId)}),
        result: data => tr('project_delete', 'result', {project: data?.deleted ? projectName(data.deleted) : ''})
    },
    recipe_open: {
        input: ({recipeId}) => tr('recipe_open', 'input', {recipe: recipeRef(recipeId)})
    },
    recipe_close: {
        input: ({recipeId}) => tr('recipe_close', 'input', {recipe: recipeRef(recipeId)})
    },
    recipe_visualizations: {
        input: ({recipeId}) => tr('recipe_visualizations', 'input', {recipe: recipeRef(recipeId)})
    },
    recipe_set_visualization: {
        input: ({recipeId}) => tr('recipe_set_visualization', 'input', {recipe: recipeRef(recipeId)})
    },
    template_list: {
        result: data => tr('template_list', 'result', {count: Array.isArray(data) ? data.length : 0})
    },
    template_apply: {
        input: ({templateId, name, projectId}) => tr('template_apply', 'input', {
            template: templateId || '', name: name || '', project: projectName(projectId)
        }),
        result: data => tr('template_apply', 'result', {
            type: recipeTypeName(data?.type), name: data?.name || ''
        })
    },
    asset_search: {
        input: ({query}) => tr('asset_search', 'input', {query: query || ''}),
        result: (data, {query} = {}) => tr('asset_search', 'result', {
            count: data?.matchingResults ?? 0, query: query || ''
        })
    },
    aoi_list_countries: {
        label: ({query}) => query ? tr('aoi_list_countries', 'labelForQuery') : null,
        input: ({query}) => query || null,
        result: (data, {query} = {}) => tr('aoi_list_countries', 'result', {
            count: Array.isArray(data) ? data.length : 0, query: query || ''
        })
    },
    aoi_list_country_areas: {
        label: ({query}) => query ? tr('aoi_list_country_areas', 'labelForQuery') : null,
        input: ({query}) => query || null,
        result: (data, {query} = {}) => tr('aoi_list_country_areas', 'result', {
            count: Array.isArray(data) ? data.length : 0, query: query || ''
        })
    },
    recipe_info: {
        label: ({type}) => type ? tr('recipe_info', 'label', {type: recipeTypeName(type)}) : null
    },
    recipe_propose_visualization: {
        input: ({mode, bands}) => tr('recipe_propose_visualization', 'input', {
            mode: mode || '', bands: (bands || []).join(', ')
        }),
        result: () => tr('recipe_propose_visualization', 'result')
    },
    workflow_start: {
        input: ({type}) => tr('workflow_start', 'input', {type: recipeTypeName(type)})
    },
    workflow_step: {},
    workflow_status: {},
    workflow_complete: {},
    workflow_cancel: {}
}

const safe = fn => {
    try {
        const out = fn()
        return out || null
    } catch {
        return null
    }
}

export const formatToolDisplay = ({name, input, data, error, status}) => {
    const formatter = formatters[name] || {}
    const label = formatter.label
        ? safe(() => formatter.label(input || {})) || translateToolName(name)
        : translateToolName(name)
    if (status === 'running') {
        const detail = formatter.input ? safe(() => formatter.input(input || {})) : null
        return {label, detail}
    }
    if (status === 'error') {
        return {label, detail: error?.message || null}
    }
    const detail = formatter.result ? safe(() => formatter.result(data, input || {})) : null
    return {label, detail}
}
