// Shared by both recipe flows (update + create). One picker.completed +
// prepare.completed event per attempt; the `flow` argument selects which
// recipe operation prefix the type/category resolves to.

const {nameList} = require('./eventFormatting')

function publishPickHandlesCompleted({bus, conversationId, recipeType, pickedHandles, flow = 'update'}) {
    const type = `${flow}_recipe.picker.completed`
    bus.publish({
        type,
        level: 'info',
        conversationId,
        recipeType,
        pickedHandleCount: pickedHandles.length,
        pickedHandles,
        message: `${type} recipeType=${recipeType} picked=${pickedHandles.length}${nameList(pickedHandles)}`
    })
}

function publishPrepareHandlePacketCompleted({bus, conversationId, recipeType, pickedHandles, writableHandles, readOnlyHandles = [], requiredHandles = [], flow = 'update'}) {
    const type = `${flow}_recipe.prepare.completed`
    bus.publish({
        type,
        level: 'info',
        conversationId,
        recipeType,
        pickedHandleCount: pickedHandles.length,
        requiredHandleCount: requiredHandles.length,
        writableHandleCount: writableHandles.length,
        readOnlyHandleCount: readOnlyHandles.length,
        writableHandles,
        readOnlyHandles,
        message: `${type} recipeType=${recipeType} picked=${pickedHandles.length}${nameList(pickedHandles)}`
            + ` required=${requiredHandles.length} writable=${writableHandles.length}${nameList(writableHandles)}`
            + ` readOnly=${readOnlyHandles.length}${nameList(readOnlyHandles)}`
    })
}

module.exports = {publishPickHandlesCompleted, publishPrepareHandlePacketCompleted}
