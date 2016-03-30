package org.openforis.sepal.hostingservice.vagrant

import org.openforis.sepal.hostingservice.HostingService
import org.openforis.sepal.hostingservice.PoolingWorkerInstanceManager
import org.openforis.sepal.hostingservice.WorkerInstanceManager
import org.openforis.sepal.util.ExecutorServiceBasedJobExecutor
import org.openforis.sepal.util.NamedThreadFactory
import org.openforis.sepal.util.SystemClock

import static java.util.concurrent.Executors.newSingleThreadExecutor

class Vagrant implements HostingService {

    final WorkerInstanceManager workerInstanceManager = new PoolingWorkerInstanceManager(
            new VagrantWorkerInstanceProvider(),
            ['vagrant-box': 1],
            new ExecutorServiceBasedJobExecutor(
                    newSingleThreadExecutor(NamedThreadFactory.singleThreadFactory('workerInstanceManager'))
            ),
            new SystemClock()
    )

    final double storageCostPerGbMonth = 0.3

}
