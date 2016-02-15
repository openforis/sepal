package org.openforis.sepal.hostingservice.aws

import com.amazonaws.auth.BasicAWSCredentials
import com.amazonaws.services.ec2.AmazonEC2Client
import com.amazonaws.services.ec2.model.*
import org.openforis.sepal.component.sandboxmanager.SandboxSession
import org.openforis.sepal.component.sandboxmanager.WorkerInstanceProvider
import org.openforis.sepal.hostingservice.InvalidInstance
import org.openforis.sepal.hostingservice.WorkerInstance
import org.openforis.sepal.hostingservice.WorkerInstanceType
import org.slf4j.Logger
import org.slf4j.LoggerFactory

class AwsWorkerInstanceProvider implements WorkerInstanceProvider {
    private static final Logger LOG = LoggerFactory.getLogger(this)
    private static final String SECURITY_GROUP = 'Sepal'
    private final String region
    private final String availabilityZone
    private final String environment
    private final AmazonEC2Client client
    private final String imageId

    private final List<WorkerInstanceType> instanceTypes = [
            new WorkerInstanceType(id: 'T2Small', name: 't2.small', hourlyCost: 0.026, description: '1 CPU / 2 GiB'),
            new WorkerInstanceType(id: 'T2Medium', name: 't2.medium', hourlyCost: 0.052, description: '2 CPU / 4 GiB'),
            new WorkerInstanceType(id: 'T2Large', name: 't2.large', hourlyCost: 0.104, description: '2 CPU / 8 GiB'),
            new WorkerInstanceType(id: 'M3Medium', name: 'm3.medium', hourlyCost: 0.067, description: '1 CPU / 3.75 GiB'),
            new WorkerInstanceType(id: 'M4Large', name: 'm4.large', hourlyCost: 0.12, description: '2 CPU / 8 GiB'),
            new WorkerInstanceType(id: 'M4Xlarge', name: 'm4.xlarge', hourlyCost: 0.239, description: '4 CPU / 16 GiB'),
            new WorkerInstanceType(id: 'M42xlarge', name: 'm4.2xlarge', hourlyCost: 0.479, description: '8 CPU / 32 GiB'),
            new WorkerInstanceType(id: 'M44xlarge', name: 'm4.4xlarge', hourlyCost: 0.958, description: '16 CPU / 64 GiB'),
            new WorkerInstanceType(id: 'M410xlarge', name: 'm4.10xlarge', hourlyCost: 2.394, description: '40 CPU / 160 GiB'),
            new WorkerInstanceType(id: 'C4Large', name: 'c4.large', hourlyCost: 0.105, description: '2 CPU / 3.75 GiB'),
            new WorkerInstanceType(id: 'C4Xlarge', name: 'c4.xlarge', hourlyCost: 0.209, description: '4 CPU / 7.5 GiB'),
            new WorkerInstanceType(id: 'C42xlarge', name: 'c4.2xlarge', hourlyCost: 0.419, description: '8 CPU / 15 GiB'),
            new WorkerInstanceType(id: 'C44xlarge', name: 'c4.4xlarge', hourlyCost: 0.838, description: '16 CPU / 30 GiB'),
            new WorkerInstanceType(id: 'C48xlarge', name: 'c4.8xlarge', hourlyCost: 1.675, description: '36 CPU / 60 GiB'),
            new WorkerInstanceType(id: 'R3Large', name: 'r3.large', hourlyCost: 0.166, description: '2 CPU / 15 GiB'),
            new WorkerInstanceType(id: 'R3Xlarge', name: 'r3.xlarge', hourlyCost: 0.333, description: '4 CPU / 30.5 GiB'),
            new WorkerInstanceType(id: 'R32xlarge', name: 'r3.2xlarge', hourlyCost: 0.665, description: '8 CPU / 61 GiB'),
            new WorkerInstanceType(id: 'R34xlarge', name: 'r3.4xlarge', hourlyCost: 1.33, description: '16 CPU / 122 GiB'),
            new WorkerInstanceType(id: 'R38xlarge', name: 'r3.8xlarge', hourlyCost: 2.66, description: '32 CPU / 244 GiB')
    ]

    AwsWorkerInstanceProvider(Config config) {
        region = config.region
        availabilityZone = config.availabilityZone
        environment = config.environment

        def credentials = new BasicAWSCredentials(config.accessKey, config.secretKey)
        client = new AmazonEC2Client(credentials)
        client.endpoint = "https://ec2.${region}.amazonaws.com"
        imageId = fetchImageId(availabilityZone, config.sepalVersion)
    }

    List<WorkerInstanceType> instanceTypes() {
        return instanceTypes
    }

    List<WorkerInstance> idleInstances(String instanceType) {
        LOG.info("Finding all idle instances of type $instanceType")
        toWorkerInstances(loadIdleInstances())
    }

    Map<String, Integer> idleCountByType() {
        LOG.info("Determining number of idle instances by type")
        def countByType = [:]
        List<Reservation> reservations = loadIdleInstances()
        reservations.each {
            it.instances.each { Instance awsInstance ->
                def type = instanceType(awsInstance)
                if (!countByType.containsKey(type))
                    countByType[type] = 0
                countByType[type] = countByType[type] + 1
            }
        }
        return countByType
    }

    WorkerInstance launch(String instanceType) {
        LOG.info("Launching $instanceType")
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
        tagInstance(awsInstance.instanceId,
                new Tag('Type', 'Sandbox'),
                new Tag('Environment', environment),
                new Tag('Name', "Sandbox - $environment")
        )
        return toWorkerInstance(awsInstance)
    }

    List<WorkerInstance> runningInstances(Collection<String> instanceIds) {
        LOG.info("Finding which instances that are running from $instanceIds")
        def request = new DescribeInstancesRequest()
                .withFilters(
                new Filter('tag:Type', ['Sandbox']),
                new Filter('tag:Environment', [environment]),
                new Filter('tag:Status', ['reserved']),
                new Filter('instance-state-name', ['running']))
                .withInstanceIds(instanceIds)
        def response = client.describeInstances(request)
        return toWorkerInstances(response.reservations)
    }

    List<WorkerInstance> allInstances() {
        LOG.info("Finding all instances")
        def request = new DescribeInstancesRequest()
                .withFilters(
                new Filter('tag:Type', ['Sandbox']),
                new Filter('tag:Environment', [environment])
        )
        def response = client.describeInstances(request)
        return toWorkerInstances(response.reservations)
    }

    void reserve(String instanceId, SandboxSession session) {
        tagInstance(instanceId,
                new Tag('Status', 'reserved'),
                new Tag('User', session.username),
                new Tag('Session id', session.id as String),
        )
    }

    void idle(String instanceId) {
        tagInstance(instanceId,
                new Tag('Status', 'idle'),
                new Tag('User', ''),
                new Tag('Session id', '')
        )
    }

    void terminate(String instanceId) {
        LOG.info("Terminating instance " + instanceId)
        def request = new TerminateInstancesRequest()
                .withInstanceIds(instanceId)
        client.terminateInstances(request)
        LOG.info("Terminated instance " + instanceId)
    }

    private List<Reservation> loadIdleInstances() {
        def request = new DescribeInstancesRequest().withFilters(
                new Filter('tag:Type', ['Sandbox']),
                new Filter('tag:Environment', [environment]),
                new Filter('tag:Status', ['idle']),
                new Filter('instance-state-name', ['pending', 'running'])
        )
        def response = client.describeInstances(request)
        return response.reservations
    }

    private WorkerInstance toWorkerInstance(Instance awsInstance) {
        return new WorkerInstance(
                id: awsInstance.instanceId,
//                host: awsInstance.privateIpAddress,
                host: awsInstance.publicIpAddress, // TODO: Switch to private ip?
                type: instanceType(awsInstance),
                running: awsInstance.state.name == 'running',
                idle: awsInstance.tags.find { it.key == 'Status' && it.value == 'idle' },
                launchTime: awsInstance.launchTime
        )
    }

    private List<WorkerInstance> toWorkerInstances(List<Reservation> reservations) {
        reservations.collect {
            it.instances.collect { Instance awsInstance ->
                toWorkerInstance(awsInstance)
            }
        }.flatten() as List<WorkerInstance>
    }


    private String instanceType(Instance awsInstance) {
        InstanceType.fromValue(awsInstance.instanceType).name()
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

    private void tagInstance(String instanceId, Tag... tags) {
        LOG.info("Tagging instance $instanceId with $tags")
        def request = new CreateTagsRequest()
                .withResources(instanceId)
                .withTags(tags)
        client.createTags(request)
    }
}
