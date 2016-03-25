package sandboxmanager

import fake.SynchronousJobExecutor
import org.openforis.sepal.component.sandboxmanager.WorkerInstanceProvider
import org.openforis.sepal.hostingservice.HostingService
import org.openforis.sepal.hostingservice.PoolingWorkerInstanceManager
import org.openforis.sepal.hostingservice.WorkerInstanceManager
import org.openforis.sepal.util.Clock

class FakeHostingService implements HostingService {
    final WorkerInstanceManager workerInstanceManager
    final double storageCostPerGbMonth

    FakeHostingService(WorkerInstanceProvider instanceProvider, Clock clock, storageCostPerGbMonth) {
        workerInstanceManager = new PoolingWorkerInstanceManager(instanceProvider, [:], new SynchronousJobExecutor(), clock)
        this.storageCostPerGbMonth = storageCostPerGbMonth
    }
}
