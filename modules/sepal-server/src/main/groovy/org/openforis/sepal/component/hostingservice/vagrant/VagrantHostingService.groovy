package org.openforis.sepal.component.hostingservice.vagrant

import org.openforis.sepal.component.hostingservice.internal.AbstractHostingService
import org.openforis.sepal.component.hostingservice.internal.InstanceType
import org.openforis.sepal.component.hostingservice.internal.UserStorageUseChecker

class VagrantHostingService extends AbstractHostingService {
    private final UserStorageUseChecker userStorageUseChecker

    VagrantHostingService(
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
