package org.openforis.sepal.component.budget.command

import groovy.transform.Canonical
import groovy.transform.EqualsAndHashCode
import org.openforis.sepal.command.AbstractCommand
import org.openforis.sepal.command.NonTransactionalCommandHandler
import org.openforis.sepal.component.budget.internal.StorageUseService
import org.openforis.sepal.transaction.TransactionManager
import org.openforis.sepal.user.UserRepository
import org.slf4j.LoggerFactory

@EqualsAndHashCode(callSuper = true)
@Canonical
class DetermineUserStorageUsage extends AbstractCommand<Void> {
}

class DetermineUserStorageUsageHandler implements NonTransactionalCommandHandler<Void, DetermineUserStorageUsage> {
    private static final LOG = LoggerFactory.getLogger(this)
    private final StorageUseService storageUseService
    private final UserRepository userRepository
    private final TransactionManager transactionManager

    DetermineUserStorageUsageHandler(
        StorageUseService storageUseService,
        UserRepository userRepository,
        TransactionManager transactionManager
    ) {
        this.storageUseService = storageUseService
        this.userRepository = userRepository
        this.transactionManager = transactionManager
    }

    Void execute(DetermineUserStorageUsage command) {
        userRepository.eachUsername {String username ->
            transactionManager.withTransaction {
                long startTime = System.currentTimeMillis()
                def storageUse = storageUseService.updateStorageUseForThisMonth(username)
                LOG.debug([command: command, username: username, storageUse: storageUse,
                           duration: (System.currentTimeMillis() - startTime) / 1000 + 's'] as String)
            }
        }
        return null
    }

}
