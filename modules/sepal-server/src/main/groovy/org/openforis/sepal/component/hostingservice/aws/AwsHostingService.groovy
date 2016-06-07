package org.openforis.sepal.component.hostingservice.aws

import org.openforis.sepal.component.hostingservice.internal.AbstractHostingService
import org.openforis.sepal.component.workersession.api.InstanceType
import org.openforis.sepal.component.hostingservice.internal.UserStorageUseChecker

class AwsHostingService extends AbstractHostingService {
    private final UserStorageUseChecker userStorageUseChecker

    AwsHostingService(List<InstanceType> instanceTypes, double storageCostPerGbMonth, String userHomeDirTemplate) {
        super(instanceTypes, storageCostPerGbMonth)
        userStorageUseChecker = new UserStorageUseChecker(userHomeDirTemplate)
    }

    double gbStorageUsed(String username) {
        userStorageUseChecker.determineUsage(username)
    }
}
