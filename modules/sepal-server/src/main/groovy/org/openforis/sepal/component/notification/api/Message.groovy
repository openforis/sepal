package org.openforis.sepal.component.notification.api

import groovy.transform.Immutable

@Immutable
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

    Message created(Date creationTime) {
        new Message(
            id: id, username: username, subject: subject, contents: contents, type: type,
            creationTime: creationTime, updateTime: updateTime)
    }

    Message updated(Date updateTime) {
        new Message(
            id: id, username: username, subject: subject, contents: contents, type: type,
            creationTime: creationTime, updateTime: updateTime)
    }

}

