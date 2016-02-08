package org.openforis.sepal.hostingservice.aws

import org.openforis.sepal.hostingservice.HostingService
import org.openforis.sepal.hostingservice.WorkerInstanceProvider

@SuppressWarnings("GroovyUnusedDeclaration")
final class Aws implements HostingService {
    final WorkerInstanceProvider workerInstanceProvider = new AwsWorkerInstanceProvider(
            new Config('/etc/sepal/aws.properties')
    )
}
