const {prepareCreatePacket$} = require('#mcp/chat/specialists/createRecipe/prepareCreatePacket')
const {aFakeBus, read} = require('../../builders')

describe('prepareCreatePacket$', () => {

    it('returns a packet whose source-of-truth is spec.defaultModel() (no GUI load-recipe round-trip)', () => {
        const result = read(prepareCreatePacket$({recipeType: 'MOSAIC', pickedHandles: ['cloudBuffer']}))

        expect(result.ok).toBe(true)
        // cloudBuffer is in defaults at 0; the prepared packet's currentValue mirrors that.
        expect(result.data.fields.cloudBuffer.currentValue).toBe(0)
    })

    it('always pulls user-required handles (aoi) into writableHandles, even when the picker chose nothing', () => {
        const result = read(prepareCreatePacket$({recipeType: 'MOSAIC', pickedHandles: []}))

        expect(result.ok).toBe(true)
        expect(result.data.writableHandles).toContain('aoi')
        expect(result.data.requiredHandles).toEqual(['aoi'])
    })

    it('surfaces aoi in fields with currentValue=null and userRequired=true so the updater knows to ask clarification when no AOI is supplied', () => {
        const result = read(prepareCreatePacket$({recipeType: 'MOSAIC', pickedHandles: []}))

        expect(result.data.fields.aoi).toMatchObject({
            currentValue: null,
            present: false,
            userRequired: true
        })
    })

    it('does not double-list a required handle when the picker also chose it', () => {
        const result = read(prepareCreatePacket$({recipeType: 'MOSAIC', pickedHandles: ['aoi', 'cloudBuffer']}))

        expect(result.data.requiredHandles).toEqual(['aoi'])
        // writable contains aoi once even though it was both picked and required.
        const aoiCount = result.data.writableHandles.filter(handle => handle === 'aoi').length
        expect(aoiCount).toBe(1)
    })

    it('does not include baseModelHash — there is no concurrency token to enforce for a new recipe', () => {
        const result = read(prepareCreatePacket$({recipeType: 'MOSAIC', pickedHandles: []}))

        expect(result.data).not.toHaveProperty('baseModelHash')
    })

    it('rejects an unsupported recipe type with UNSUPPORTED_RECIPE_TYPE before doing any work', () => {
        const result = read(prepareCreatePacket$({recipeType: 'NOT_REAL', pickedHandles: []}))

        expect(result).toMatchObject({ok: false, error: {code: 'UNSUPPORTED_RECIPE_TYPE'}})
    })

    it('rejects an unknown picked handle with UNKNOWN_HANDLE', () => {
        const result = read(prepareCreatePacket$({recipeType: 'MOSAIC', pickedHandles: ['nope']}))

        expect(result).toMatchObject({ok: false, error: {code: 'UNKNOWN_HANDLE', handles: ['nope']}})
    })

    it('publishes create_recipe.prepare.completed (not update_recipe.prepare.completed) with the writable + required counts', () => {
        const bus = aFakeBus()

        read(prepareCreatePacket$({recipeType: 'MOSAIC', pickedHandles: ['cloudBuffer'], bus, conversationId: 'c1'}))

        expect(bus.published.find(event => event.type === 'create_recipe.prepare.completed')).toBeDefined()
        expect(bus.published.find(event => event.type === 'update_recipe.prepare.completed')).toBeUndefined()
        const event = bus.published.find(event => event.type === 'create_recipe.prepare.completed')
        expect(event.writableHandles).toContain('aoi')
        expect(event.writableHandles).toContain('cloudBuffer')
    })
})
