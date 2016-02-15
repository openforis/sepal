package org.openforis.sepal.hostingservice.vagrant

import org.openforis.sepal.hostingservice.HostingService
import org.openforis.sepal.hostingservice.PoolingWorkerInstanceManager
import org.openforis.sepal.hostingservice.WorkerInstanceManager
import org.openforis.sepal.util.SystemClock

class Vagrant implements HostingService {

    final WorkerInstanceManager workerInstanceManager = new PoolingWorkerInstanceManager(
            new VagrantWorkerInstanceProvider(),
            ['vagrant-box': 1],
            new SystemClock()
    )
}
