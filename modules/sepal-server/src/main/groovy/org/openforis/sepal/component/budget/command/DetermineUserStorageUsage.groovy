package org.openforis.sepal.component.budget.command

import org.openforis.sepal.command.AbstractCommand
import org.openforis.sepal.command.CommandHandler
import org.openforis.sepal.component.budget.internal.StorageUseService

class DetermineUserStorageUsage extends AbstractCommand<Void> {
}

class DetermineUserStorageUsageHandler implements CommandHandler<Void, DetermineUserStorageUsage> {
    private final StorageUseService storageUseService

    DetermineUserStorageUsageHandler(StorageUseService storageUseService) {
        this.storageUseService = storageUseService
    }

    Void execute(DetermineUserStorageUsage command) {
        storageUseService.updateStorageUseForThisMonth(command.username)
        return null
    }

}
