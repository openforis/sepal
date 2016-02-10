package org.openforis.sepal.hostingservice.vagrant

import org.openforis.sepal.hostingservice.HostingService
import org.openforis.sepal.hostingservice.PoolingWorkerInstanceManager
import org.openforis.sepal.hostingservice.WorkerInstanceManager
import org.openforis.sepal.util.ExecutorServiceBasedJobExecutor
import org.openforis.sepal.util.NamedThreadFactory

import java.util.concurrent.Executors

class Vagrant implements HostingService {

    final WorkerInstanceManager workerInstanceManager = new PoolingWorkerInstanceManager(
            new VagrantWorkerInstanceProvider(),
            ['vagrant-box': 1],
            new ExecutorServiceBasedJobExecutor(
                    Executors.newSingleThreadExecutor(NamedThreadFactory.singleThreadFactory('pooled-worker-instance-manager-worker'))
            )
    )
}
