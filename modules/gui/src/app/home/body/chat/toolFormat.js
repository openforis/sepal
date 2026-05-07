import {select} from '~/store'
import {msg} from '~/translate'

import {loadProjects$, loadRecipes$} from '../process/recipe'

const humanize = toolName =>
    toolName.replace(/_/g, ' ').replace(/^\w/, c => c.toUpperCase())

const recipeTypeName = type =>
    type ? msg(`tasks.details.recipeTypeNames.${type}`, {}, type) : ''

const translateToolName = toolName =>
    msg(`home.sections.chat.tools.${toolName}.label`, {}, humanize(toolName))

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
    msg(`home.sections.chat.tools.${toolName}.${slot}`, args, '')

const formatters = {
    recipe_create: {
        input: ({type, name, projectId}) => tr('recipe_create', 'input', {
            type: recipeTypeName(type), name: name || '', project: projectName(projectId)
        }),
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
        input: ({type, projectId}) => tr('recipe_list', 'input', {
            type: recipeTypeName(type), project: projectName(projectId)
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
    gui_open_recipe: {
        input: ({recipeId}) => tr('gui_open_recipe', 'input', {recipe: recipeRef(recipeId)})
    },
    gui_reload_recipe: {
        input: ({recipeId}) => tr('gui_reload_recipe', 'input', {recipe: recipeRef(recipeId)})
    },
    gui_close_recipe: {
        input: ({recipeId}) => tr('gui_close_recipe', 'input', {recipe: recipeRef(recipeId)})
    },
    gui_list_visualizations: {
        input: ({recipeId}) => tr('gui_list_visualizations', 'input', {recipe: recipeRef(recipeId)})
    },
    gui_set_visualization: {
        input: ({recipeId}) => tr('gui_set_visualization', 'input', {recipe: recipeRef(recipeId)})
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
        result: data => tr('asset_search', 'result', {count: data?.matchingResults ?? 0})
    },
    aoi_list_countries: {
        result: data => tr('aoi_list_countries', 'result', {count: Array.isArray(data) ? data.length : 0})
    },
    aoi_list_country_areas: {
        input: ({countryCode}) => tr('aoi_list_country_areas', 'input', {country: countryCode || ''}),
        result: data => tr('aoi_list_country_areas', 'result', {count: Array.isArray(data) ? data.length : 0})
    },
    recipe_schema: {
        input: ({type}) => tr('recipe_schema', 'input', {type: recipeTypeName(type)})
    },
    recipe_bands: {
        input: ({type}) => tr('recipe_bands', 'input', {type: recipeTypeName(type)})
    },
    recipe_visualizations: {
        input: ({type}) => tr('recipe_visualizations', 'input', {type: recipeTypeName(type)})
    },
    recipe_defaults: {
        input: ({type}) => tr('recipe_defaults', 'input', {type: recipeTypeName(type)})
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
    const label = translateToolName(name)
    const formatter = formatters[name] || {}
    if (status === 'running') {
        const detail = formatter.input ? safe(() => formatter.input(input || {})) : null
        return {label, detail}
    }
    if (status === 'error') {
        return {label, detail: error?.message || null}
    }
    const detail = formatter.result ? safe(() => formatter.result(data)) : null
    return {label, detail}
}
