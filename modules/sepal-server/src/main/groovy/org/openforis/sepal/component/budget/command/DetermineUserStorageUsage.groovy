package org.openforis.sepal.component.budget.command

import org.openforis.sepal.command.AbstractCommand
import org.openforis.sepal.command.CommandHandler
import org.openforis.sepal.component.budget.internal.StorageUseService
import org.openforis.sepal.user.UserRepository
import org.openforis.sepal.util.annotation.Data

@Data(callSuper = true)
class DetermineUserStorageUsage extends AbstractCommand<Void> {
}

class DetermineUserStorageUsageHandler implements CommandHandler<Void, DetermineUserStorageUsage> {
    private final StorageUseService storageUseService
    private final UserRepository userRepository

    DetermineUserStorageUsageHandler(StorageUseService storageUseService, UserRepository userRepository) {
        this.storageUseService = storageUseService
        this.userRepository = userRepository
    }

    Void execute(DetermineUserStorageUsage command) {
        userRepository.eachUsername {
            storageUseService.updateStorageUseForThisMonth(it)
        }

        return null
    }

}
