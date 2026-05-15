const {productTools} = require('#mcp/chat/tools/productTools')
const {aFakeGuiRequests} = require('../builders')

describe('product tools', () => {

    it('composes the full product tool surface in stable order', () => {
        const tools = productTools({guiRequests: aFakeGuiRequests()})

        expect(tools.map(tool => tool.name)).toEqual([
            'get_context',
            'recipe_list',
            'project_list',
            'recipe_load',
            'map_area_list',
            'layer_list'
        ])
    })
})
