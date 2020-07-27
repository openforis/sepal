package org.openforis.sepal.component.budget.command

import groovy.transform.Canonical
import groovy.transform.EqualsAndHashCode
import org.openforis.sepal.command.AbstractCommand
import org.openforis.sepal.command.CommandHandler
import org.openforis.sepal.component.budget.internal.StorageUseService

@EqualsAndHashCode(callSuper = true)
@Canonical
class UpdateUserStorageUsage extends AbstractCommand<Void> {
    String userToUpdate
    double gbUsed
}

class UpdateUserStorageUsageHandler implements CommandHandler<Void, UpdateUserStorageUsage> {
    private final StorageUseService storageUseService

    UpdateUserStorageUsageHandler(StorageUseService storageUseService) {
        this.storageUseService = storageUseService
    }

    Void execute(UpdateUserStorageUsage command) {
        storageUseService.updateStorageUseForThisMonth(command.userToUpdate, command.gbUsed)
        return null
    }
}
