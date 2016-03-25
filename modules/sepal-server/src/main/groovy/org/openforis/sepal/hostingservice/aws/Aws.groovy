package org.openforis.sepal.hostingservice.aws

import org.openforis.sepal.hostingservice.HostingService
import org.openforis.sepal.hostingservice.PoolingWorkerInstanceManager
import org.openforis.sepal.hostingservice.WorkerInstanceManager
import org.openforis.sepal.util.ExecutorServiceBasedJobExecutor
import org.openforis.sepal.util.NamedThreadFactory
import org.openforis.sepal.util.SystemClock

import java.util.concurrent.Executors

import static java.util.concurrent.Executors.newSingleThreadExecutor

@SuppressWarnings("GroovyUnusedDeclaration")
final class Aws implements HostingService {
    final WorkerInstanceManager workerInstanceManager = new PoolingWorkerInstanceManager(
            new AwsWorkerInstanceProvider(new Config('/data/aws.properties')),
            ['T2Small': 1],
            new ExecutorServiceBasedJobExecutor(
                    newSingleThreadExecutor(NamedThreadFactory.singleThreadFactory('workerInstanceManager'))
            ),
            new SystemClock()
    )

    final double storageCostPerGbMonth = 0.3
}
