// The blank EBS volume a session gets for its /tmp on an instance type without local NVMe SSDs
// (with them, the worker AMI mounts the SSDs under Docker's volumes at boot). It lives exactly as
// long as the session: attached to the running instance before the session's containers are
// created, detached and deleted once they are gone. The provisioner formats it and hands it to the
// containers as a Docker volume; Docker unmounts it with the last container using it.
// A volume is tagged from its creation, so the sweep deletes what an interrupted attach or removal
// left detached; one left attached goes with the instance, marked delete-on-termination.

import {
    AttachVolumeCommand,
    CreateVolumeCommand,
    DeleteVolumeCommand,
    DescribeInstancesCommand,
    DescribeVolumesCommand,
    DetachVolumeCommand,
    ModifyInstanceAttributeCommand,
    waitUntilVolumeAvailable,
    waitUntilVolumeInUse,
} from '@aws-sdk/client-ec2'

import {getLogger} from '#sepal/log'

import {instanceTag} from '../../tag.js'

const log = getLogger('worker/aws/scratchVolumes')

const DEVICE_NAME = '/dev/xvdg'
const SIZE_GIB = 100
const VOLUME_TYPE = 'gp3'
// A detached volume younger than this may be one a provisioning is about to attach.
const ORPHAN_GRACE_MS = 10 * 60_000
const WAITER = {minDelay: 1, maxDelay: 5, maxWaitTime: 300}

export class ScratchVolumes {
    #client
    #environment
    #availabilityZone
    #instanceTypeById

    constructor({client, environment, availabilityZone, instanceTypes}) {
        this.#client = client
        this.#environment = environment
        this.#availabilityZone = availabilityZone
        this.#instanceTypeById = new Map(instanceTypes.map(type => [type.id, type]))
    }

    // Resolves the device the volume is attached as, or null when the instance type has local
    // SSDs. Idempotent: a provisioning retry finds the volume the previous attempt attached.
    async attach(instance) {
        if (!this.#needsVolume(instance.type)) {
            return null
        }
        if (await this.#attachedVolumeId(instance.id)) {
            return DEVICE_NAME
        }
        const {VolumeId: volumeId} = await this.#client.send(new CreateVolumeCommand({
            AvailabilityZone: this.#availabilityZone,
            Size: SIZE_GIB,
            VolumeType: VOLUME_TYPE,
            TagSpecifications: [{ResourceType: 'volume', Tags: this.#tags()}],
        }))
        await waitUntilVolumeAvailable({client: this.#client, ...WAITER}, {VolumeIds: [volumeId]})
        await this.#client.send(new AttachVolumeCommand({InstanceId: instance.id, VolumeId: volumeId, Device: DEVICE_NAME}))
        await waitUntilVolumeInUse({client: this.#client, ...WAITER}, {VolumeIds: [volumeId]})
        await this.#client.send(new ModifyInstanceAttributeCommand({
            InstanceId: instance.id,
            BlockDeviceMappings: [{DeviceName: DEVICE_NAME, Ebs: {DeleteOnTermination: true}}],
        }))
        log.info(`Attached scratch volume ${volumeId} to ${instanceTag(instance)}`)
        return DEVICE_NAME
    }

    // The volume must no longer be mounted: the caller has removed the containers using it.
    async remove(instanceId) {
        const volumeId = await this.#attachedVolumeId(instanceId)
        if (!volumeId) {
            return
        }
        await this.#client.send(new DetachVolumeCommand({InstanceId: instanceId, VolumeId: volumeId}))
        await waitUntilVolumeAvailable({client: this.#client, ...WAITER}, {VolumeIds: [volumeId]})
        await this.#client.send(new DeleteVolumeCommand({VolumeId: volumeId}))
        log.info(`Deleted scratch volume ${volumeId} of ${instanceTag(instanceId)}`)
    }

    // Best-effort, like the sweep's other cleanups: whatever fails is retried by the next sweep.
    async deleteOrphans() {
        try {
            await this.#deleteOrphans()
        } catch (err) {
            log.warn(`Failed to delete orphaned scratch volumes: ${err.message}`)
        }
    }

    async #deleteOrphans() {
        const response = await this.#client.send(new DescribeVolumesCommand({
            Filters: [
                ...this.#tags().map(({Key, Value}) => ({Name: `tag:${Key}`, Values: [Value]})),
                {Name: 'status', Values: ['available']},
            ],
        }))
        const minCreated = Date.now() - ORPHAN_GRACE_MS
        const orphans = (response.Volumes ?? []).filter(v => new Date(v.CreateTime).getTime() < minCreated)
        await Promise.all(orphans.map(({VolumeId}) =>
            this.#client.send(new DeleteVolumeCommand({VolumeId}))
                .then(() => log.info(`Deleted orphaned scratch volume ${VolumeId}`))
                .catch(err => log.warn(`Failed to delete orphaned scratch volume ${VolumeId}: ${err.message}`))
        ))
    }

    // x1 is a Xen type: its instance store appears only when mapped at launch, and never as NVMe,
    // which is what the AMI looks for.
    #needsVolume(instanceType) {
        const type = this.#instanceTypeById.get(instanceType)
        return !type || type.ssdGB === 0 || type.name.startsWith('x1.')
    }

    async #attachedVolumeId(instanceId) {
        const response = await this.#client.send(new DescribeInstancesCommand({InstanceIds: [instanceId]}))
        const instance = (response.Reservations ?? []).flatMap(r => r.Instances ?? [])[0]
        return instance?.BlockDeviceMappings?.find(m => m.DeviceName === DEVICE_NAME)?.Ebs?.VolumeId ?? null
    }

    #tags() {
        return [
            {Key: 'Type', Value: 'WorkerScratch'},
            {Key: 'Environment', Value: this.#environment},
        ]
    }
}
