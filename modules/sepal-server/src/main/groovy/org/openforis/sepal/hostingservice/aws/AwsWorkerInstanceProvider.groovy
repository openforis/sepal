package org.openforis.sepal.hostingservice.aws

import com.amazonaws.auth.BasicAWSCredentials
import com.amazonaws.services.ec2.AmazonEC2Client
import com.amazonaws.services.ec2.model.*
import org.openforis.sepal.hostingservice.InvalidInstance
import org.openforis.sepal.hostingservice.WorkerInstance
import org.openforis.sepal.hostingservice.WorkerInstanceProvider
import org.openforis.sepal.hostingservice.WorkerInstanceType
import org.slf4j.Logger
import org.slf4j.LoggerFactory

import static org.openforis.sepal.hostingservice.Status.STARTING

class AwsWorkerInstanceProvider implements WorkerInstanceProvider {
    private static final Logger LOG = LoggerFactory.getLogger(this)
    private static final String SECURITY_GROUP = 'sepal'
    private final String region
    private final String availabilityZone
    private final String environment
    final List<WorkerInstanceType> instanceTypes = InstanceType.values().collect {
        new WorkerInstanceType(
                id: it.name(),
                name: it.toString()
        )
    }

    private final AmazonEC2Client client
    private final String imageId

    AwsWorkerInstanceProvider(Config config) {
        region = config.region
        availabilityZone = config.availabilityZone
        environment = config.environment

        def credentials = new BasicAWSCredentials(config.accessKey, config.secretKey)
        client = new AmazonEC2Client(credentials)
        client.endpoint = "https://ec2.${region}.amazonaws.com"
        imageId = fetchImageId(availabilityZone, config.sepalVersion)
    }

    WorkerInstance allocate(String instanceType) {
        def request = new RunInstancesRequest()
                .withKeyName(region)
                .withInstanceType(instanceType as InstanceType)
                .withSecurityGroups(SECURITY_GROUP)
                .withImageId(imageId)
                .withMinCount(1).withMaxCount(1)
                .withPlacement(new Placement(availabilityZone: availabilityZone))
                .withBlockDeviceMappings(
                new BlockDeviceMapping(
                        deviceName: '/dev/sda1',
                        ebs: new EbsBlockDevice(
                                volumeSize: 15,
                                volumeType: VolumeType.Standard,
                                deleteOnTermination: true
                        )
                )
        )

        def response = client.runInstances(request)
        def awsInstance = response.reservation.instances.first()
        tagInstance(awsInstance)

        return new WorkerInstance(
                id: awsInstance.instanceId,
                host: awsInstance.privateIpAddress,
                type: instanceType,
                state: STARTING
        )
    }

    boolean terminate(String instanceId) {
        LOG.info("Terminating instance " + instanceId)
        def request = new TerminateInstancesRequest()
                .withInstanceIds(instanceId)
        client.terminateInstances(request)
        LOG.info("Terminated instance " + instanceId)
        return true
    }

    private String fetchImageId(String availabilityZone, String sepalVersion) {
        def request = new DescribeImagesRequest()
        request.withFilters(
                new Filter("tag:Version", [sepalVersion]),
                new Filter('tag:AvailabilityZone', [availabilityZone])
        )
        def response = client.describeImages(request)
        if (!response?.images)
            throw new InvalidInstance("Unable to get image for $region having version $sepalVersion")
        def image = response.images.first()
        return image.imageId
    }

    private void tagInstance(Instance instance) {
        def request = new CreateTagsRequest()
                .withResources(instance.instanceId)
                .withTags(
                new Tag('Type', 'Sandbox'),
                new Tag('Environment', 'environment'),
                new Tag('Name', "Sandbox($environment)")
        )
        client.createTags(request)
    }
}
