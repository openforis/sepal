const {guiRequest} = require('./guiRequest')

const createProjectTools = () => [
    {
        name: 'project_list',
        description: 'List all projects for the current user',
        parameters: {
            type: 'object',
            properties: {}
        },
        handler: async ({request}) =>
            guiRequest(request, 'list-projects')
    },
    {
        name: 'project_create',
        description: 'Create a new project',
        parameters: {
            type: 'object',
            properties: {
                name: {type: 'string', description: 'Project name'},
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
        description: 'Delete a project and all its recipes',
        parameters: {
            type: 'object',
            properties: {
                projectId: {type: 'string', description: 'Project ID to delete'}
            },
            required: ['projectId']
        },
        handler: async ({params, request}) =>
            guiRequest(request, 'delete-project', {projectId: params.projectId})
    }
]

module.exports = {createProjectTools}
