const toISOString = value => {
    if (value == null) {
        return null
    }
    return new Date(value).toISOString()
}

const rowToMessage = row => {
    if (!row) {
        return null
    }
    return {
        id: row.id,
        username: row.username,
        subject: row.subject,
        contents: row.contents,
        type: row.type,
        creationTime: row.creation_time,
        updateTime: row.update_time,
        removed: !!row.removed,
        priority: row.priority ?? 0
    }
}

const messageToMap = message => ({
    id: message.id,
    username: message.username,
    subject: message.subject,
    contents: message.contents,
    type: message.type,
    creationTime: toISOString(message.creationTime),
    updateTime: toISOString(message.updateTime),
    priority: message.priority ?? 0
})

// Top-level `username` is the requesting user (the per-user notification row owner);
// message.username is the author.
const notificationToMap = row => ({
    message: messageToMap({
        id: row.messageId,
        username: row.author,
        subject: row.subject,
        contents: row.contents,
        type: row.type,
        creationTime: row.creation_time,
        updateTime: row.update_time,
        priority: row.priority
    }),
    username: row.username,
    state: row.state,
    acknowledged: row.acknowledged ?? 0
})

export {messageToMap, notificationToMap, rowToMessage, toISOString}
