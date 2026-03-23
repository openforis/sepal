const createGuiTools = () => [
    {
        name: 'gui_open_recipe',
        description: 'Tell the user\'s browser to open/load a recipe in the SEPAL interface',
        parameters: {
            type: 'object',
            properties: {
                recipeId: {type: 'string', description: 'The recipe ID to open'}
            },
            required: ['recipeId']
        },
        handler: async ({params, send}) => {
            send({type: 'gui-action', action: 'open', recipeId: params.recipeId})
            return {success: true, data: {action: 'open', recipeId: params.recipeId}}
        }
    },
    {
        name: 'gui_reload_recipe',
        description: 'Tell the browser to reload an already-open recipe to reflect changes',
        parameters: {
            type: 'object',
            properties: {
                recipeId: {type: 'string', description: 'The recipe ID to reload'}
            },
            required: ['recipeId']
        },
        handler: async ({params, send}) => {
            send({type: 'gui-action', action: 'reload', recipeId: params.recipeId})
            return {success: true, data: {action: 'reload', recipeId: params.recipeId}}
        }
    },
    {
        name: 'gui_close_recipe',
        description: 'Tell the browser to close a recipe tab',
        parameters: {
            type: 'object',
            properties: {
                recipeId: {type: 'string', description: 'The recipe ID to close'}
            },
            required: ['recipeId']
        },
        handler: async ({params, send}) => {
            send({type: 'gui-action', action: 'close', recipeId: params.recipeId})
            return {success: true, data: {action: 'close', recipeId: params.recipeId}}
        }
    }
]

module.exports = {createGuiTools}
