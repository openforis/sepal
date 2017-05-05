package org.openforis.sepal.component.user.command

import org.openforis.sepal.command.AbstractCommand
import org.openforis.sepal.command.CommandHandler
import org.openforis.sepal.component.user.api.ExternalUserDataGateway
import org.openforis.sepal.component.user.api.UserRepository
import org.openforis.sepal.messagebroker.MessageBroker
import org.openforis.sepal.messagebroker.MessageQueue
import org.openforis.sepal.util.annotation.Data

@Data(callSuper = true)
class DeleteUser extends AbstractCommand<Void> {
}

class DeleteUserHandler implements CommandHandler<Void, DeleteUser> {
    private final ExternalUserDataGateway externalUserDataGateway
    private final UserRepository userRepository
    private final MessageQueue<String> messageQueue

    DeleteUserHandler(ExternalUserDataGateway externalUserDataGateway, UserRepository userRepository, MessageBroker messageBroker) {
        this.externalUserDataGateway = externalUserDataGateway
        this.userRepository = userRepository
        this.messageQueue = messageBroker.createMessageQueue('user.delete_user', String) {
            externalUserDataGateway.deleteUser(it)
        }
    }

    Void execute(DeleteUser command) {
        userRepository.deleteUser(command.username)
        messageQueue.publish(command.username)
        return null
    }
}

