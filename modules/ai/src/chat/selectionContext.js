const formatRecipeSummary = recipe => {
    const name = recipe.recipeName || 'Untitled recipe'
    const type = recipe.recipeType ? ` (${recipe.recipeType})` : ''
    const project = recipe.projectName ? ` in "${recipe.projectName}"` : ''
    return `"${name}"${type}${project}`
}

const formatAppSummary = app =>
    `"${app.appName || app.path || 'Untitled app'}"`

const formatSelection = selection => {
    if (!selection) return 'No selection context.'
    const lines = []
    if (selection.section) lines.push(`Section: ${selection.section}`)
    if (selection.selectedProject?.projectName) {
        lines.push(`Selected project: "${selection.selectedProject.projectName}"`)
    }
    if (selection.openRecipes?.length) {
        lines.push(`Open recipes (${selection.openRecipes.length}): ${selection.openRecipes.map(formatRecipeSummary).join(', ')}`)
    }
    if (selection.selectedRecipe) {
        const panels = selection.selectedRecipe.activePanels?.length
            ? `; active panels: ${selection.selectedRecipe.activePanels.join(', ')}`
            : ''
        lines.push(`Selected recipe: ${formatRecipeSummary(selection.selectedRecipe)}${panels}`)
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
