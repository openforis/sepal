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
class AcceptPrivacyPolicy extends AbstractCommand<Void> {
}

class AcceptPrivacyPolicyHandler implements CommandHandler<Void, AcceptPrivacyPolicy> {
    private final UserRepository userRepository

    AcceptPrivacyPolicyHandler(UserRepository userRepository) {
        this.userRepository = userRepository
    }

    Void execute(AcceptPrivacyPolicy command) {
        userRepository.acceptPrivacyPolicy(command.username)
        return null
    }
}
