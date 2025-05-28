package org.openforis.sepal.component.user.command

import groovy.transform.Canonical
import groovy.transform.EqualsAndHashCode
import org.openforis.sepal.command.AbstractCommand
import org.openforis.sepal.command.CommandHandler
import org.openforis.sepal.component.user.api.UserRepository
import org.openforis.sepal.component.user.internal.UserChangeListener
import org.openforis.sepal.messagebroker.MessageBroker
import org.openforis.sepal.messagebroker.MessageQueue
import org.openforis.sepal.user.User
import org.openforis.sepal.util.Clock
import org.slf4j.Logger
import org.slf4j.LoggerFactory

@EqualsAndHashCode(callSuper = true)
@Canonical
class UpdateUserDetails extends AbstractCommand<User> {
    String usernameToUpdate
    String name
    String email
    String organization
    String intendedUse
    boolean emailNotificationsEnabled
    boolean manualMapRenderingEnabled
    boolean privacyPolicyAccepted
    boolean admin
}

class UpdateUserDetailsHandler implements CommandHandler<User, UpdateUserDetails> {
    private static final Logger LOG = LoggerFactory.getLogger(this)
    private final UserRepository userRepository
    private final MessageQueue<Map> messageQueue
    private final Clock clock

    UpdateUserDetailsHandler(
            UserRepository userRepository,
            MessageBroker messageBroker,
            UserChangeListener changeListener,
            Clock clock) {
        this.userRepository = userRepository
        this.messageQueue = messageBroker.createMessageQueue('user.update_user_details', Map) {
            def user = it.user as User
            LOG.debug("Updated user details and notifies change listener: ${user}")
            changeListener.changed(user.username, user.toMap())
        }
        this.clock = clock
    }

    User execute(UpdateUserDetails command) {
        def user = userRepository
                .lookupUser(command.usernameToUpdate)
                .withDetails(
                        command.name,
                        command.email,
                        command.organization,
                        command.intendedUse,
                        command.emailNotificationsEnabled,
                        command.manualMapRenderingEnabled,
                        command.privacyPolicyAccepted,
                        command.admin
                )
                .withUpdateTime(clock.now())
        userRepository.updateUserDetails(user)
        messageQueue.publish(user: user)
        return user
    }
}
