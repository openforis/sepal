package org.openforis.sepal.component.notification.api

interface MessageRepository {

    Message saveMessage(Message message)

    void removeMessage(String id)

    List<Message> listMessages()

    Message getMessageById(String id)

}