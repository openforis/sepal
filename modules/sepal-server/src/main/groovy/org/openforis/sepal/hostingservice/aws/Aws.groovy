package org.openforis.sepal.hostingservice.aws

import org.openforis.sepal.hostingservice.HostingService
import org.openforis.sepal.hostingservice.PoolingWorkerInstanceManager
import org.openforis.sepal.hostingservice.WorkerInstanceManager
import org.openforis.sepal.util.ExecutorServiceBasedJobExecutor
import org.openforis.sepal.util.NamedThreadFactory

import java.util.concurrent.Executors

@SuppressWarnings("GroovyUnusedDeclaration")
final class Aws implements HostingService {
    final WorkerInstanceManager workerInstanceManager = new PoolingWorkerInstanceManager(
            new AwsWorkerInstanceProvider(new Config('/etc/sepal/aws.properties')),
            ['T2Small': 2],
            new ExecutorServiceBasedJobExecutor(
                    Executors.newSingleThreadExecutor(NamedThreadFactory.singleThreadFactory('pooled-worker-instance-manager-worker'))
            )
    )

}
