import {select} from '~/store'

import {resolveSourceLabel} from './sourceLabel'

const SECTION_NAMES = {
    '/': 'process',
    '/-/browse': 'browse',
    '/-/app-launch-pad': 'apps',
    '/-/terminal': 'terminal',
    '/-/tasks': 'tasks',
    '/-/users': 'users'
}

const currentSection = () =>
    SECTION_NAMES[window.location.pathname] || window.location.pathname

const findProjectName = projectId => {
    if (!projectId) return null
    const projects = select('process.projects') || []
    return projects.find(project => project.id === projectId)?.name || null
}

const activePanelIds = recipe =>
    Object.entries(recipe?.activatables || {})
        .filter(([_id, activatable]) => activatable?.active)
        .map(([id]) => id)

const mapAreasSummary = recipe => {
    const areas = recipe?.layers?.areas || {}
    const result = {}
    for (const [area, layer] of Object.entries(areas)) {
        const visParams = layer?.imageLayer?.layerConfig?.visParams
        result[area] = {
            sourceId: layer?.imageLayer?.sourceId || null,
            sourceLabel: resolveSourceLabel(recipe, layer?.imageLayer?.sourceId),
            bands: visParams?.bands || null,
            type: visParams?.type || null
        }
    }
    return result
}

const recipeSummary = tab => {
    if (!tab) return null
    const savedRecipes = select('process.recipes') || []
    const loadedRecipes = select('process.loadedRecipes') || {}
    const recipe = loadedRecipes[tab.id] || savedRecipes.find(r => r.id === tab.id)
    return {
        recipeId: tab.id,
        recipeName: tab.title || tab.placeholder,
        recipeType: tab.type,
        projectId: recipe?.projectId || null,
        projectName: findProjectName(recipe?.projectId),
        activePanels: activePanelIds(recipe),
        mapAreas: mapAreasSummary(recipe)
    }
}

const appSummary = tab => tab ? {
    appId: tab.id,
    appName: tab.title || tab.placeholder,
    path: tab.path
} : null

const selectedFrom = (tabs, selectedId, summary) =>
    summary(tabs.find(tab => tab.id === selectedId))

const projectSummary = projectId => {
    if (!projectId) return null
    const name = findProjectName(projectId)
    return name ? {projectId, projectName: name} : null
}

export const currentGuiContext = () => {
    const recipeTabs = select('process.tabs') || []
    const appTabs = select('apps.tabs') || []
    return {
        section: currentSection(),
        selectedProject: projectSummary(select('process.projectId')),
        openRecipes: recipeTabs.map(recipeSummary).filter(Boolean),
        selectedRecipe: selectedFrom(recipeTabs, select('process.selectedTabId'), recipeSummary),
        openApps: appTabs.map(appSummary).filter(Boolean),
        selectedApp: selectedFrom(appTabs, select('apps.selectedTabId'), appSummary),
        mapView: select('map.view') || null
    }
}
