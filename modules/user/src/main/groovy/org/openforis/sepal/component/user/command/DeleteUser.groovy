package org.openforis.sepal.component.user.command

import groovy.transform.Canonical
import groovy.transform.EqualsAndHashCode
import org.openforis.sepal.command.AbstractCommand
import org.openforis.sepal.command.CommandHandler
import org.openforis.sepal.component.user.api.ExternalUserDataGateway
import org.openforis.sepal.component.user.api.UserRepository
import org.openforis.sepal.component.user.internal.UserChangeListener
import org.openforis.sepal.messagebroker.MessageBroker
import org.openforis.sepal.messagebroker.MessageQueue

@EqualsAndHashCode(callSuper = true)
@Canonical
class DeleteUser extends AbstractCommand<Void> {
}

class DeleteUserHandler implements CommandHandler<Void, DeleteUser> {
    private final ExternalUserDataGateway externalUserDataGateway
    private final UserRepository userRepository
    private final MessageQueue<String> messageQueue

    DeleteUserHandler(
        ExternalUserDataGateway externalUserDataGateway,
        UserRepository userRepository,
        MessageBroker messageBroker,
        UserChangeListener changeListener
    ) {
        this.externalUserDataGateway = externalUserDataGateway
        this.userRepository = userRepository
        this.messageQueue = messageBroker.createMessageQueue('user.delete_user', String) {
            externalUserDataGateway.deleteUser(it)
            changeListener.changed(it, null)
        }
    }

    Void execute(DeleteUser command) {
        userRepository.deleteUser(command.username)
        messageQueue.publish(command.username)
        return null
    }
}

