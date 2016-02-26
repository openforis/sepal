package org.openforis.sepal.component.sandboxmanager.command

import org.openforis.sepal.command.AbstractCommand
import org.openforis.sepal.command.CommandHandler
import org.openforis.sepal.component.sandboxmanager.ResourceUsageService
import org.openforis.sepal.user.UserRepository

class UpdateStorageUsage extends AbstractCommand<Void> {

}

class UpdateStorageUsageHandler implements CommandHandler<Void, UpdateStorageUsage> {
    private final UserRepository userRepository
    private final ResourceUsageService resourceUsageService

    UpdateStorageUsageHandler(UserRepository userRepository, ResourceUsageService resourceUsageService) {
        this.userRepository = userRepository
        this.resourceUsageService = resourceUsageService
    }

    Void execute(UpdateStorageUsage command) {
        userRepository.eachUsername { String username ->
            resourceUsageService.updateStorageUsage(username)
        }
        return null
    }
}
