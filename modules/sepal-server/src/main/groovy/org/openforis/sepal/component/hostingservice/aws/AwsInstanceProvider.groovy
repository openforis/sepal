package org.openforis.sepal.component.hostingservice.aws

import com.amazonaws.auth.BasicAWSCredentials
import com.amazonaws.services.ec2.AmazonEC2Client
import com.amazonaws.services.ec2.model.*
import org.openforis.sepal.component.workerinstance.api.InstanceProvider
import org.openforis.sepal.component.workerinstance.api.WorkerInstance
import org.openforis.sepal.component.workerinstance.api.WorkerReservation
import org.openforis.sepal.hostingservice.InvalidInstance
import org.openforis.sepal.util.DateTime
import org.openforis.sepal.util.JobScheduler
import org.slf4j.Logger
import org.slf4j.LoggerFactory

import java.util.concurrent.TimeUnit

final class AwsInstanceProvider implements InstanceProvider {
    private static final Logger LOG = LoggerFactory.getLogger(this)
    private static final String SECURITY_GROUP = 'Sandbox'
    private final JobScheduler jobScheduler
    private final int sepalVersion
    private final String region
    private final String availabilityZone
    private final String environment
    private final AmazonEC2Client client
    private final String imageId
    private final List<Closure> launchListeners = []

    AwsInstanceProvider(JobScheduler jobScheduler, AwsConfig config) {
        this.jobScheduler = jobScheduler
        sepalVersion = config.sepalVersion
        region = config.region
        availabilityZone = config.availabilityZone
        environment = config.environment
        def credentials = new BasicAWSCredentials(config.accessKey, config.secretKey)
        client = new AmazonEC2Client(credentials)
        client.endpoint = "https://ec2.${region}.amazonaws.com"
        imageId = fetchImageId(availabilityZone)
    }

    WorkerInstance launchReserved(WorkerInstance instance) {
        Instance awsInstance = launch(instance)
        tagInstance(awsInstance.instanceId, launchTags(instance), reserveTags(instance))
        return toWorkerInstance(awsInstance)
    }

    void launchIdle(List<WorkerInstance> instances) {
        instances.each { instance ->
            Instance awsInstance = launch(instance)
            tagInstance(awsInstance.instanceId, launchTags(instance), idleTags())
        }
    }

    void terminate(String instanceId) {
        LOG.info("Terminating instance " + instanceId)
        def request = new TerminateInstancesRequest()
                .withInstanceIds(instanceId)
        client.terminateInstances(request)
        LOG.info("Terminated instance " + instanceId)
    }

    void reserve(WorkerInstance instance) {
        tagInstance(instance.id, reserveTags(instance))
    }

    void release(String instanceId) {
        tagInstance(instanceId, idleTags())
    }

    List<WorkerInstance> idleInstances(String instanceType) {
        findInstances(
                taggedWith('State', 'idle'),
                ofInstanceType(instanceType)
        )
    }

    List<WorkerInstance> idleInstances() {
        findInstances(
                taggedWith('State', 'idle')
        )
    }

    List<WorkerInstance> reservedInstances() {
        findInstances(
                taggedWith('State', 'reserved')
        )
    }

    WorkerInstance getInstance(String instanceId) {
        findInstances(
                taggedWith('InstanceId', instanceId)
        ).first()
    }

    void onInstanceLaunched(Closure listener) {
        launchListeners << listener
    }

    void start() {
        jobScheduler.schedule(0, 10, TimeUnit.SECONDS) {
            try {
                notifyAboutStartedInstance()
            } catch (Exception e) {
                LOG.error('Failed to notify about started instances', e)
            }
        }
    }

    private void notifyAboutStartedInstance() {
        def instances = findInstances(running(), taggedWith('Starting', 'true'))
        instances.each {
            tagInstance(it.id, [tag('Starting', '')])
            launchListeners*.call(it)
        }
    }

    void stop() {
        jobScheduler.stop()
    }

    private List<Tag> launchTags(WorkerInstance instance) {
        [
                tag('Environment', environment),
                tag('Type', 'Worker'),
                tag('Version', sepalVersion as String),
                tag('InstanceId', instance.id),
                tag('Starting', 'true')
        ]
    }

    private List<Tag> reserveTags(WorkerInstance instance) {
        [
                tag('State', 'reserved'),
                tag('Username', instance.reservation.username),
                tag('WorkerType', instance.reservation.workerType),
                tag('ReservationTime', DateTime.toDateTimeString(new Date())),
                tag('IdleTime', ''),
                tag('Name', "$environment: $instance.reservation.workerType, $instance.reservation.username")
        ]
    }

    private List<Tag> idleTags() {
        [
                tag('State', 'idle'),
                tag('Username', ''),
                tag('WorkerType', ''),
                tag('IdleTime', DateTime.toDateTimeString(new Date())),
                tag('IdleTime', ''),
                tag('Name', "$environment: Idle worker")
        ]
    }

    private Tag tag(String name, String value) {
        return new Tag(name, value)
    }

    private Filter taggedWith(String tagName, String value) {
        new Filter("tag:$tagName", [value])
    }

    private Filter running() {
        new Filter('instance-state-name', ['running'])
    }

    private Filter ofInstanceType(String instanceType) {
        new Filter('instance-type', [(instanceType as InstanceType).toString()])
    }

    private List<WorkerInstance> findInstances(Filter... filters) {
        def request = new DescribeInstancesRequest().withFilters(
                filters.toList() + [
                        taggedWith('Type', 'Worker'),
                        taggedWith('Environment', environment),
                        new Filter('instance-state-name', ['pending', 'running'])
                ])
        def awsInstances = client.describeInstances(request).reservations
                .collect { it.instances }.flatten() as List<Instance>
        def instancesWithValidVersion = awsInstances.findAll {
            (tagValue(it, 'Version') as int) >= sepalVersion
        }
        return instancesWithValidVersion.collect { toWorkerInstance(it) }
    }

    private Instance launch(WorkerInstance instance) {
        def instanceType = instance.type
        LOG.info("Launching $instanceType")
        def request = new RunInstancesRequest()
                .withKeyName(region)
                .withInstanceType(instanceType as InstanceType)
                .withSecurityGroups(SECURITY_GROUP)
                .withImageId(imageId)
                .withMinCount(1).withMaxCount(1)
                .withPlacement(new Placement(availabilityZone: availabilityZone))

        def response = client.runInstances(request)
        response.reservation.instances.first()
    }

    private String fetchImageId(String availabilityZone) {
        def request = new DescribeImagesRequest()
        request.withFilters(
                new Filter("tag:Version", [sepalVersion as String]),
                new Filter('tag:AvailabilityZone', [availabilityZone])
        )
        def response = client.describeImages(request)
        if (!response?.images)
            throw new InvalidInstance("Unable to get image for $region having version $sepalVersion")
        def image = response.images.first()
        LOG.info("Using sandbox image $image.imageId")
        return image.imageId
    }

    private void tagInstance(String instanceId, Collection<Tag>... tagCollections) {
        def tags = tagCollections.toList().flatten() as Tag[]
        LOG.info("Tagging instance $instanceId with $tags")
        def request = new CreateTagsRequest()
                .withResources(instanceId)
                .withTags(tags)
        client.createTags(request)
    }

    private WorkerInstance toWorkerInstance(Instance awsInstance) {
        def idle = tagValue(awsInstance, 'State') == 'idle'
        def reservation = idle ? null :
                new WorkerReservation(
                        username: tagValue(awsInstance, 'Username'),
                        workerType: tagValue(awsInstance, 'WorkerType')
                )
        return new WorkerInstance(
                id: awsInstance.instanceId,
                type: instanceType(awsInstance),
                host: awsInstance.publicIpAddress,
                running: awsInstance.state.name == 'running',
                launchTime: awsInstance.launchTime,
                reservation: reservation
        )
    }

    private String tagValue(Instance awsInstance, String key) {
        awsInstance.tags.find { it.key == key }?.value
    }

    private String instanceType(Instance awsInstance) {
        InstanceType.fromValue(awsInstance.instanceType).name()
    }
}
