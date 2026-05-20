const recipeListSchema = {
    name: 'recipe_list',
    description: 'List recipes.',
    parameters: {type: 'object', properties: {}, additionalProperties: true}
}
const projectListSchema = {
    name: 'project_list',
    description: 'List projects.',
    parameters: {type: 'object', properties: {}, additionalProperties: true}
}

module.exports = {recipeListSchema, projectListSchema}
