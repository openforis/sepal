const {map} = require('rxjs')
const {guiProductRequest$} = require('./guiProductRequest')

function projectTools(guiRequests) {
    return [
        projectListTool(guiRequests)
    ]
}

function projectListTool(guiRequests) {
    return {
        name: 'project_list',
        description: 'List projects -> id, name. Use when user asks to list/show projects, or to resolve a project for a project-specific operation. Don\'t call after recipe_list for a plain recipe-list request.',
        parameters: {type: 'object', properties: {}, additionalProperties: false},
        invoke$: (_input, context) =>
            guiProductRequest$(guiRequests, context, 'list-projects', {}).pipe(
                map(projects => projects.map(projectSummary))
            )
    }
}

function projectSummary(project) {
    return {id: project.id, name: project.name}
}

module.exports = {projectTools}
