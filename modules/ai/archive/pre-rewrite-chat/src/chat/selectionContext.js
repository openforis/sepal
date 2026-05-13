// User-controlled fields (recipe/project/app names, asset paths) flow into the
// system prompt. Strip line breaks and `#` so a crafted name can't forge a new
// markdown section or otherwise restructure the surrounding context. Truncate
// to keep the prompt bounded.
const MAX_FIELD_LEN = 120
const sanitize = s => {
    if (typeof s !== 'string') return s
    const cleaned = s.replace(/[\r\n#]/g, ' ').trim()
    return cleaned.length > MAX_FIELD_LEN ? `${cleaned.slice(0, MAX_FIELD_LEN - 3)}...` : cleaned
}

const formatRecipeSummary = recipe => {
    const name = sanitize(recipe.recipeName) || 'Untitled recipe'
    const type = recipe.recipeType ? ` (${recipe.recipeType})` : ''
    const projectName = sanitize(recipe.projectName)
    const project = projectName ? ` in "${projectName}"` : ''
    const id = recipe.recipeId ? ` id=${recipe.recipeId}` : ''
    return `"${name}"${type}${project}${id}`
}

const formatAppSummary = app =>
    `"${sanitize(app.appName) || sanitize(app.path) || 'Untitled app'}"`

// Surface populated map areas only when there's more than one — single-pane
// "center" is the default and uninteresting. When split-pane:
// `area=source:bands(type)`.
const formatMapAreas = mapAreas => {
    if (!mapAreas) return null
    const entries = Object.entries(mapAreas)
    if (entries.length < 2) return null
    const parts = entries.map(([area, info]) => {
        const source = info?.sourceLabel ? `${sanitize(info.sourceLabel)}:` : ''
        const bands = Array.isArray(info?.bands) && info.bands.length
            ? info.bands.join('+')
            : '∅'
        const type = info?.type ? `(${info.type})` : ''
        return `${area}=${source}${bands}${type}`
    })
    return `Map areas (${entries.length}): ${parts.join(', ')}`
}

const round = (n, dp = 4) =>
    typeof n === 'number' && Number.isFinite(n)
        ? Number(n.toFixed(dp))
        : null

const formatMapView = mapView => {
    if (!mapView) return null
    const bounds = mapView.bounds
    const boundsStr = Array.isArray(bounds) && bounds.length === 2
        ? `[${round(bounds[0][0])},${round(bounds[0][1])}]→[${round(bounds[1][0])},${round(bounds[1][1])}]`
        : '?'
    const center = mapView.center
    const centerStr = center && Number.isFinite(center.lat) && Number.isFinite(center.lng)
        ? `${round(center.lat)},${round(center.lng)}`
        : '?'
    const zoom = Number.isFinite(mapView.zoom) ? mapView.zoom : '?'
    return `Map view: zoom=${zoom} center=${centerStr} bounds=${boundsStr}`
}

const formatSelection = selection => {
    if (!selection) return 'No selection context.'
    const lines = []
    if (selection.section) lines.push(`Section: ${selection.section}`)
    if (selection.selectedProject?.projectName) {
        lines.push(`Selected project: "${sanitize(selection.selectedProject.projectName)}"`)
    }
    if (selection.openRecipes?.length) {
        lines.push(`Open recipes (${selection.openRecipes.length}): ${selection.openRecipes.map(formatRecipeSummary).join(', ')}`)
    }
    if (selection.selectedRecipe) {
        const panels = selection.selectedRecipe.activePanels?.length
            ? `; active panels: ${selection.selectedRecipe.activePanels.join(', ')}`
            : ''
        lines.push(`Selected recipe: ${formatRecipeSummary(selection.selectedRecipe)}${panels}`)
        const areaLine = formatMapAreas(selection.selectedRecipe.mapAreas)
        if (areaLine) lines.push(areaLine)
        const viewLine = formatMapView(selection.mapView)
        if (viewLine) lines.push(viewLine)
    } else if (selection.openRecipes?.length) {
        lines.push('Selected recipe: none')
    }
    if (selection.openApps?.length) {
        lines.push(`Open apps (${selection.openApps.length}): ${selection.openApps.map(formatAppSummary).join(', ')}`)
        if (selection.selectedApp) {
            lines.push(`Selected app: ${formatAppSummary(selection.selectedApp)}`)
        }
    }
    if (lines.length === 1 && lines[0].startsWith('Section:')) {
        return `${lines[0]}. Nothing open.`
    }
    return lines.join('\n')
}

module.exports = {formatSelection}
