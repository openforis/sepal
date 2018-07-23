package org.openforis.sepal.component.notification.api

import org.openforis.sepal.util.annotation.ImmutableData

@ImmutableData
class Message {
    String id
    String username
    String subject
    String contents
    Type type
    Date creationTime
    Date updateTime

    enum Type {
        SYSTEM
    }

    Message updated(Date date) {
        new Message(
                id: id, username: username, subject: subject, contents: contents, type: type,
                creationTime: creationTime, updateTime: date)
    }

}

