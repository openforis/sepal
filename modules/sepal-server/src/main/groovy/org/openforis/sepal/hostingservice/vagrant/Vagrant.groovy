package org.openforis.sepal.hostingservice.vagrant

import org.openforis.sepal.hostingservice.HostingService
import org.openforis.sepal.hostingservice.WorkerInstanceProvider

class Vagrant implements HostingService {
    final WorkerInstanceProvider workerInstanceProvider = new VagrantWorkerInstanceProvider()
}
