package fake

import org.openforis.sepal.component.sandboxmanager.StorageUsageChecker

class FakeStorageUsageChecker implements StorageUsageChecker {
    double usage

    double determineUsage(String username) {
        return usage
    }
}
