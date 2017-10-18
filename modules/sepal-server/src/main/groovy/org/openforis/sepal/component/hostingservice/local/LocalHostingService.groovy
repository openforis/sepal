package org.openforis.sepal.component.hostingservice.local

import org.openforis.sepal.component.hostingservice.api.InstanceType
import org.openforis.sepal.component.hostingservice.internal.AbstractHostingService
import org.openforis.sepal.component.hostingservice.internal.UserStorageUseChecker

class LocalHostingService extends AbstractHostingService {
    private final UserStorageUseChecker userStorageUseChecker

    LocalHostingService(
            List<InstanceType> instanceTypes,
            double storageCostPerGbMonth,
            String userHomeDirTemplate) {
        super(instanceTypes, storageCostPerGbMonth)
        userStorageUseChecker = new UserStorageUseChecker(userHomeDirTemplate)
    }

    double gbStorageUsed(String username) {
        userStorageUseChecker.determineUsage(username)
    }
}
