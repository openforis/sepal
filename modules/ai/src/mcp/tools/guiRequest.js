const guiRequest = async (request, action, payload = {}, options = {}) => {
    try {
        const data = await request({type: 'gui-action', action, ...payload}, options)
        return {success: true, data}
    } catch (error) {
        return {success: false, error: {code: 'GUI_REQUEST_FAILED', message: error.message}}
    }
}

module.exports = {guiRequest}
