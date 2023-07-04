package org.openforis.sepal.component.user.command

import groovy.transform.Canonical
import groovy.transform.EqualsAndHashCode
import org.openforis.sepal.command.AbstractCommand
import org.openforis.sepal.command.CommandHandler
import org.openforis.sepal.component.user.api.EmailGateway
import org.openforis.sepal.component.user.api.ExternalUserDataGateway
import org.openforis.sepal.component.user.api.UserRepository
import org.openforis.sepal.component.user.internal.UserChangeListener
import org.openforis.sepal.messagebroker.MessageBroker
import org.openforis.sepal.messagebroker.MessageQueue
import org.openforis.sepal.user.User
import org.openforis.sepal.user.User.Status
import org.slf4j.Logger
import org.slf4j.LoggerFactory

@EqualsAndHashCode(callSuper = true)
@Canonical
class LockUser extends AbstractCommand<Void> {
    String usernameToLock
}

class LockUserHandler implements CommandHandler<User, LockUser> {
    private static final Logger LOG = LoggerFactory.getLogger(this)
    private final ExternalUserDataGateway externalUserDataGateway
    private final UserRepository userRepository
    private final MessageQueue<Map> messageQueue
    private final UserChangeListener changeListener

    LockUserHandler(
        ExternalUserDataGateway externalUserDataGateway,
        UserRepository userRepository,
        MessageBroker messageBroker,
        UserChangeListener changeListener
    ) {
        this.externalUserDataGateway = externalUserDataGateway
        this.userRepository = userRepository
        this.messageQueue = messageBroker.createMessageQueue('user.lock', Map) {
            lock(it)
        }
        this.changeListener = changeListener
    }

    User execute(LockUser command) {
        def user = userRepository.lookupUser(command.usernameToLock)
                
        if (!user) {
            LOG.info("Cannot lock non-existing user: " + command)
            return null
        }

        if (user.status == Status.LOCKED) {
            LOG.info("Ignoring lock for already locked user: " + user)
            return user
        }

        userRepository.updateStatus(command.usernameToLock, Status.LOCKED)
        def lockedUser = user.withStatus(Status.LOCKED)
        messageQueue.publish(user: lockedUser)
        return lockedUser
    }

    private void lock(Map message) {
        def user = message.user as User
        changeListener.locked(user.username, user.toMap())
        LOG.info("User locked: " + user.username)
        def randomPassword = UUID.randomUUID() as String
        externalUserDataGateway.changePassword(user.username, randomPassword)
    }
}
