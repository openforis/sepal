const guiRequest = async (request, action, payload = {}, options = {}) => {
    try {
        // payload is nested, not spread, so its fields (e.g. recipe `type`)
        // can't collide with the routing keys `type: 'gui-action'` and `action`.
        const data = await request({type: 'gui-action', action, params: payload}, options)
        return {success: true, data}
    } catch (error) {
        return {success: false, error: {code: 'GUI_REQUEST_FAILED', message: error.message}}
    }
}

module.exports = {guiRequest}
