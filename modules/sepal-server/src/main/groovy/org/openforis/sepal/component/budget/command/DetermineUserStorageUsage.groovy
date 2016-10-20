package org.openforis.sepal.component.budget.command

import org.openforis.sepal.command.AbstractCommand
import org.openforis.sepal.command.CommandHandler
import org.openforis.sepal.component.budget.internal.StorageUseService
import org.openforis.sepal.user.UserRepository
import org.openforis.sepal.util.annotation.Data
import org.slf4j.LoggerFactory

@Data(callSuper = true)
class DetermineUserStorageUsage extends AbstractCommand<Void> {
}

class DetermineUserStorageUsageHandler implements CommandHandler<Void, DetermineUserStorageUsage> {
    private static final LOG = LoggerFactory.getLogger(this)
    private final StorageUseService storageUseService
    private final UserRepository userRepository

    DetermineUserStorageUsageHandler(StorageUseService storageUseService, UserRepository userRepository) {
        this.storageUseService = storageUseService
        this.userRepository = userRepository
    }

    Void execute(DetermineUserStorageUsage command) {
        userRepository.eachUsername {
            long startTime = System.currentTimeMillis()
            def storageUse = storageUseService.updateStorageUseForThisMonth(it)
            LOG.debug([command: command, username: it, storageUse: storageUse,
                       duration: (System.currentTimeMillis() - startTime) / 1000 + 's'] as String)
        }
        return null
    }

}
