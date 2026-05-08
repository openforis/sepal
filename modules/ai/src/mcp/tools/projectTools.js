const {guiRequest} = require('./guiRequest')

const createProjectTools = () => [
    {
        name: 'project_list',
        description: 'List user\'s projects. Returns `[{id, name, defaultAssetFolder, defaultWorkspaceFolder}]`. Use to resolve project name → id for `recipe_create.projectId` / `recipe_move.projectId`, or to present options.',
        parameters: {
            type: 'object',
            properties: {}
        },
        handler: async ({request}) =>
            guiRequest(request, 'list-projects')
    },
    {
        name: 'project_create',
        description: 'Create a project. Only when user asks for one or confirms — never silently create just because no matching project exists.',
        parameters: {
            type: 'object',
            properties: {
                name: {type: 'string', description: 'REQUIRED. User\'s name or one derived from request. Never omit.'},
                defaultAssetFolder: {type: 'string', description: 'Default GEE asset folder path.'},
                defaultWorkspaceFolder: {type: 'string', description: 'Default workspace folder path.'}
            },
            required: ['name']
        },
        handler: async ({params, request}) =>
            guiRequest(request, 'create-project', params)
    },
    {
        name: 'project_select',
        description: 'Set active project (recipe-list filter). Pass `projectId` to switch, omit to clear. Only after user confirms — never silently switch.',
        parameters: {
            type: 'object',
            properties: {
                projectId: {type: ['string', 'null'], description: 'Project id (from project_list), or null/omit to clear.'}
            }
        },
        handler: async ({params, request}) =>
            guiRequest(request, 'select-project', {projectId: params.projectId || null})
    },
    {
        name: 'project_delete',
        description: 'DESTRUCTIVE: deletes project AND all recipes inside. Always confirm with user, naming project + recipe count (use recipe_list filtered by projectId).',
        parameters: {
            type: 'object',
            properties: {
                projectId: {type: 'string', description: 'Project id (from project_list).'}
            },
            required: ['projectId']
        },
        handler: async ({params, request}) =>
            guiRequest(request, 'delete-project', {projectId: params.projectId})
    }
]

module.exports = {createProjectTools}
