const {guiRequest} = require('./guiRequest')

const createProjectTools = () => [
    {
        name: 'project_list',
        description: 'List the current user\'s projects. Returns an array of `{id, name, defaultAssetFolder, defaultWorkspaceFolder}`. Use this to resolve a project name the user mentions to its `id` (for `recipe_create.projectId` / `recipe_move.projectId`), or to present available projects when asking the user where a new recipe should go.',
        parameters: {
            type: 'object',
            properties: {}
        },
        handler: async ({request}) =>
            guiRequest(request, 'list-projects')
    },
    {
        name: 'project_create',
        description: 'Create a new project. Only call this when the user explicitly asks for a new project, or has confirmed they want one — do not silently create a project just because no matching project exists.',
        parameters: {
            type: 'object',
            properties: {
                name: {type: 'string', description: 'REQUIRED. Project name — use the name the user gave, or derive a clear, concise human-readable name from their request. Never omit this parameter.'},
                defaultAssetFolder: {type: 'string', description: 'Default GEE asset folder path'},
                defaultWorkspaceFolder: {type: 'string', description: 'Default workspace folder path'}
            },
            required: ['name']
        },
        handler: async ({params, request}) =>
            guiRequest(request, 'create-project', params)
    },
    {
        name: 'project_delete',
        description: 'DESTRUCTIVE: deletes a project AND every recipe inside it. Always confirm with the user before calling, naming the project and the number of recipes that will be removed (call recipe_list filtered by projectId first if helpful).',
        parameters: {
            type: 'object',
            properties: {
                projectId: {type: 'string', description: 'Project ID to delete (from project_list)'}
            },
            required: ['projectId']
        },
        handler: async ({params, request}) =>
            guiRequest(request, 'delete-project', {projectId: params.projectId})
    }
]

module.exports = {createProjectTools}
