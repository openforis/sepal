package org.openforis.sepal.component.notification.api

interface MessageRepository {

    void saveMessage(Message message)

    void removeMessage(String id)

    List<Message> listMessages()

    Message getMessageById(String id)

}