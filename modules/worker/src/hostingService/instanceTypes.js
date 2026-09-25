// InstanceType catalog.
//
// Field semantics:
//   id          — stable identifier used across the codebase and DB
//   name        — AWS EC2 instance type string
//   tag         — short tag used for pool targeting (undefined = not pooled idle)
//   cpuCount    — vCPU count
//   ramGiB      — RAM in gibibytes
//   hourlyCost  — USD/hr on-demand price
//   idleCount   — target idle pool size (undefined = 0, i.e. 0 warm)
//   devices     — host device paths to pass through (undefined = none, e.g. GPU)
//   gpuCount    — GPU count (default 0)
//   performance — CPU throughput relative to t1 (t3a.small = 1): the type's PassMark CPU Mark as
//                 measured by Spare Cores (sparecores.com) over t3a.small's. t3a.small's figure is
//                 at full burst; its sustained baseline is 20% of each vCPU.
//   ssdGB       — total local NVMe instance-store capacity in GB (default 0). The worker AMI mounts
//                 it as the sessions' /tmp; see worker-ami/scratch.
//
// Derived:
//   description — "$cpuCount CPU, $ramGiB GB" ("$gpuCount GPU" after the CPU count when gpuCount > 0)
//   ramBytes    — ramGiB * 2^30

const makeInstanceType = ({id, name, tag, cpuCount, ramGiB, hourlyCost, idleCount, devices, gpuCount, performance, ssdGB}) => ({
    id,
    name,
    tag,
    cpuCount,
    ramGiB,
    hourlyCost,
    idleCount: idleCount ?? 0,
    devices: devices ?? [],
    gpuCount: gpuCount ?? 0,
    performance,
    ssdGB: ssdGB ?? 0,
    get description() { return `${cpuCount} CPU, ${gpuCount ? `${gpuCount} GPU, ` : ''}${ramGiB} GB` },
    get ramBytes() { return ramGiB * Math.pow(2, 30) },
})

// ─── Instance catalog (90 types) ─────────────────────────────────────────────
// Local hosting uses it too, so a dev stack offers the same types as AWS.
export const INSTANCE_TYPES = [
    // Current generation (tagged, user-selectable)
    makeInstanceType({id: 'T3aSmall', name: 't3a.small', tag: 't1', hourlyCost: 0.0204, cpuCount: 2, ramGiB: 2, performance: 1.0}),
    makeInstanceType({id: 'T3aMedium', name: 't3a.medium', tag: 't2', hourlyCost: 0.0408, cpuCount: 2, ramGiB: 4, performance: 1.0}),
    makeInstanceType({id: 'M6aLarge', name: 'm6a.large', tag: 'm2', hourlyCost: 0.0963, cpuCount: 2, ramGiB: 8, performance: 1.8}),
    makeInstanceType({id: 'M6idLarge', name: 'm6id.large', tag: 'm2d', hourlyCost: 0.1323, cpuCount: 2, ramGiB: 8, performance: 1.6, ssdGB: 118}),
    makeInstanceType({id: 'M6aXlarge', name: 'm6a.xlarge', tag: 'm4', hourlyCost: 0.1926, cpuCount: 4, ramGiB: 16, performance: 3.7}),
    makeInstanceType({id: 'M6idXlarge', name: 'm6id.xlarge', tag: 'm4d', hourlyCost: 0.2646, cpuCount: 4, ramGiB: 16, performance: 3.2, ssdGB: 237}),
    makeInstanceType({id: 'M6a2xlarge', name: 'm6a.2xlarge', tag: 'm8', hourlyCost: 0.3852, cpuCount: 8, ramGiB: 32, performance: 7.0}),
    makeInstanceType({id: 'M6id2xlarge', name: 'm6id.2xlarge', tag: 'm8d', hourlyCost: 0.5292, cpuCount: 8, ramGiB: 32, performance: 6.1, ssdGB: 474}),
    makeInstanceType({id: 'M6a4xlarge', name: 'm6a.4xlarge', tag: 'm16', hourlyCost: 0.7704, cpuCount: 16, ramGiB: 64, performance: 12.6}),
    makeInstanceType({id: 'M6id4xlarge', name: 'm6id.4xlarge', tag: 'm16d', hourlyCost: 1.0584, cpuCount: 16, ramGiB: 64, performance: 11.3, ssdGB: 950}),
    makeInstanceType({id: 'M6a12xlarge', name: 'm6a.12xlarge', tag: 'm48', hourlyCost: 2.3112, cpuCount: 48, ramGiB: 192, performance: 29.3}),
    makeInstanceType({id: 'M6id12xlarge', name: 'm6id.12xlarge', tag: 'm48d', hourlyCost: 3.1752, cpuCount: 48, ramGiB: 192, performance: 26.1, ssdGB: 2850}),
    makeInstanceType({id: 'M6a16xlarge', name: 'm6a.16xlarge', tag: 'm64', hourlyCost: 3.0816, cpuCount: 64, ramGiB: 256, performance: 36.2}),
    makeInstanceType({id: 'M6id16xlarge', name: 'm6id.16xlarge', tag: 'm64d', hourlyCost: 4.2336, cpuCount: 64, ramGiB: 256, performance: 31.0, ssdGB: 3800}),
    makeInstanceType({id: 'C8aLarge', name: 'c8a.large', tag: 'c2', hourlyCost: 0.11563, cpuCount: 2, ramGiB: 4, performance: 3.7}),
    makeInstanceType({id: 'C6idLarge', name: 'c6id.large', tag: 'c2d', hourlyCost: 0.11445, cpuCount: 2, ramGiB: 4, performance: 1.6, ssdGB: 118}),
    makeInstanceType({id: 'C8aXlarge', name: 'c8a.xlarge', tag: 'c4', hourlyCost: 0.23126, cpuCount: 4, ramGiB: 8, performance: 7.3}),
    makeInstanceType({id: 'C6idXlarge', name: 'c6id.xlarge', tag: 'c4d', hourlyCost: 0.2289, cpuCount: 4, ramGiB: 8, performance: 3.2, ssdGB: 237}),
    makeInstanceType({id: 'C8a2xlarge', name: 'c8a.2xlarge', tag: 'c8', hourlyCost: 0.46252, cpuCount: 8, ramGiB: 16, performance: 13.8}),
    makeInstanceType({id: 'C6id2xlarge', name: 'c6id.2xlarge', tag: 'c8d', hourlyCost: 0.4578, cpuCount: 8, ramGiB: 16, performance: 6.1, ssdGB: 474}),
    makeInstanceType({id: 'C8a4xlarge', name: 'c8a.4xlarge', tag: 'c16', hourlyCost: 0.92504, cpuCount: 16, ramGiB: 32, performance: 25.2}),
    makeInstanceType({id: 'C6id4xlarge', name: 'c6id.4xlarge', tag: 'c16d', hourlyCost: 0.9156, cpuCount: 16, ramGiB: 32, performance: 11.4, ssdGB: 950}),
    makeInstanceType({id: 'C8a8xlarge', name: 'c8a.8xlarge', tag: 'c32', hourlyCost: 1.85008, cpuCount: 32, ramGiB: 64, performance: 43.0}),
    makeInstanceType({id: 'C6id8xlarge', name: 'c6id.8xlarge', tag: 'c32d', hourlyCost: 1.8312, cpuCount: 32, ramGiB: 64, performance: 19.7, ssdGB: 1900}),
    makeInstanceType({id: 'C8a12xlarge', name: 'c8a.12xlarge', tag: 'c48', hourlyCost: 2.77512, cpuCount: 48, ramGiB: 96, performance: 55.0}),
    makeInstanceType({id: 'C6id12xlarge', name: 'c6id.12xlarge', tag: 'c48d', hourlyCost: 2.7468, cpuCount: 48, ramGiB: 96, performance: 26.2, ssdGB: 2850}),
    makeInstanceType({id: 'C8a16xlarge', name: 'c8a.16xlarge', tag: 'c64', hourlyCost: 3.70016, cpuCount: 64, ramGiB: 128, performance: 63.6}),
    makeInstanceType({id: 'C6id16xlarge', name: 'c6id.16xlarge', tag: 'c64d', hourlyCost: 3.6624, cpuCount: 64, ramGiB: 128, performance: 30.9, ssdGB: 3800}),
    makeInstanceType({id: 'R6aLarge', name: 'r6a.large', tag: 'r2', hourlyCost: 0.1269, cpuCount: 2, ramGiB: 16, performance: 1.9}),
    makeInstanceType({id: 'R8idLarge', name: 'r8id.large', tag: 'r2d', hourlyCost: 0.1848, cpuCount: 2, ramGiB: 16, performance: 2.2, ssdGB: 118}),
    makeInstanceType({id: 'R6aXlarge', name: 'r6a.xlarge', tag: 'r4', hourlyCost: 0.2538, cpuCount: 4, ramGiB: 32, performance: 3.7}),
    makeInstanceType({id: 'R8idXlarge', name: 'r8id.xlarge', tag: 'r4d', hourlyCost: 0.3696, cpuCount: 4, ramGiB: 32, performance: 4.3, ssdGB: 237}),
    makeInstanceType({id: 'R6a2xlarge', name: 'r6a.2xlarge', tag: 'r8', hourlyCost: 0.5076, cpuCount: 8, ramGiB: 64, performance: 7.0}),
    makeInstanceType({id: 'R8id2xlarge', name: 'r8id.2xlarge', tag: 'r8d', hourlyCost: 0.7392, cpuCount: 8, ramGiB: 64, performance: 8.4, ssdGB: 474}),
    makeInstanceType({id: 'R6a4xlarge', name: 'r6a.4xlarge', tag: 'r16', hourlyCost: 1.0152, cpuCount: 16, ramGiB: 128, performance: 12.7}),
    makeInstanceType({id: 'R8id4xlarge', name: 'r8id.4xlarge', tag: 'r16d', hourlyCost: 1.4784, cpuCount: 16, ramGiB: 128, performance: 15.6, ssdGB: 950}),
    makeInstanceType({id: 'R6a8xlarge', name: 'r6a.8xlarge', tag: 'r32', hourlyCost: 2.0304, cpuCount: 32, ramGiB: 256, performance: 22.5}),
    makeInstanceType({id: 'R8id8xlarge', name: 'r8id.8xlarge', tag: 'r32d', hourlyCost: 2.9568, cpuCount: 32, ramGiB: 256, performance: 27.8, ssdGB: 1900}),
    makeInstanceType({id: 'R6a16xlarge', name: 'r6a.16xlarge', tag: 'r64', hourlyCost: 4.0608, cpuCount: 64, ramGiB: 512, performance: 36.0}),
    makeInstanceType({id: 'R8id16xlarge', name: 'r8id.16xlarge', tag: 'r64d', hourlyCost: 5.9136, cpuCount: 64, ramGiB: 512, performance: 44.4, ssdGB: 3800}),
    makeInstanceType({id: 'X2idn16xlarge', name: 'x2idn.16xlarge', tag: 'x64', hourlyCost: 8.003, cpuCount: 64, ramGiB: 1024, performance: 30.5, ssdGB: 1900}),
    makeInstanceType({id: 'X2idn32xlarge', name: 'x2idn.32xlarge', tag: 'x128', hourlyCost: 16.006, cpuCount: 128, ramGiB: 2048, performance: 46.8, ssdGB: 3800}),
    // Older / legacy generation (no tag — not pooled idle)
    makeInstanceType({id: 'C7aLarge', name: 'c7a.large', hourlyCost: 0.11012, cpuCount: 2, ramGiB: 4, performance: 2.9}),
    makeInstanceType({id: 'C7aXlarge', name: 'c7a.xlarge', hourlyCost: 0.22024, cpuCount: 4, ramGiB: 8, performance: 5.7}),
    makeInstanceType({id: 'C7a2xlarge', name: 'c7a.2xlarge', hourlyCost: 0.44048, cpuCount: 8, ramGiB: 16, performance: 9.6}),
    makeInstanceType({id: 'C7a4xlarge', name: 'c7a.4xlarge', hourlyCost: 0.88096, cpuCount: 16, ramGiB: 32, performance: 19.6}),
    makeInstanceType({id: 'C7a8xlarge', name: 'c7a.8xlarge', hourlyCost: 1.76192, cpuCount: 32, ramGiB: 64, performance: 28.7}),
    makeInstanceType({id: 'C7a12xlarge', name: 'c7a.12xlarge', hourlyCost: 2.64288, cpuCount: 48, ramGiB: 96, performance: 43.2}),
    makeInstanceType({id: 'C7a16xlarge', name: 'c7a.16xlarge', hourlyCost: 3.52384, cpuCount: 64, ramGiB: 128, performance: 50.1}),
    makeInstanceType({id: 'X116xlarge', name: 'x1.16xlarge', hourlyCost: 8.003, cpuCount: 64, ramGiB: 976, performance: 17.3, ssdGB: 1920}),
    makeInstanceType({id: 'X132xlarge', name: 'x1.32xlarge', hourlyCost: 16.006, cpuCount: 128, ramGiB: 1920, performance: 21.7, ssdGB: 3840}),
    makeInstanceType({id: 'T2Small', name: 't2.small', hourlyCost: 0.025, cpuCount: 1, ramGiB: 2, performance: 0.8}),
    makeInstanceType({id: 'M3Medium', name: 'm3.medium', hourlyCost: 0.073, cpuCount: 1, ramGiB: 3.75, performance: 0.8}),
    makeInstanceType({id: 'M4Large', name: 'm4.large', hourlyCost: 0.119, cpuCount: 2, ramGiB: 8, performance: 1.0}),
    makeInstanceType({id: 'M4Xlarge', name: 'm4.xlarge', hourlyCost: 0.238, cpuCount: 4, ramGiB: 16, performance: 1.9}),
    makeInstanceType({id: 'M42xlarge', name: 'm4.2xlarge', hourlyCost: 0.475, cpuCount: 8, ramGiB: 32, performance: 3.8}),
    makeInstanceType({id: 'M44xlarge', name: 'm4.4xlarge', hourlyCost: 0.95, cpuCount: 16, ramGiB: 64, performance: 7.1}),
    makeInstanceType({id: 'M410xlarge', name: 'm4.10xlarge', hourlyCost: 2.377, cpuCount: 40, ramGiB: 160, performance: 15.6}),
    makeInstanceType({id: 'M416xlarge', name: 'm4.16xlarge', hourlyCost: 3.803, cpuCount: 64, ramGiB: 256, performance: 18.6}),
    makeInstanceType({id: 'M5aLarge', name: 'm5a.large', hourlyCost: 0.096, cpuCount: 2, ramGiB: 8, performance: 1.0}),
    makeInstanceType({id: 'M5aXlarge', name: 'm5a.xlarge', hourlyCost: 0.192, cpuCount: 4, ramGiB: 16, performance: 2.0}),
    makeInstanceType({id: 'M5a2xlarge', name: 'm5a.2xlarge', hourlyCost: 0.384, cpuCount: 8, ramGiB: 32, performance: 3.7}),
    makeInstanceType({id: 'M5a4xlarge', name: 'm5a.4xlarge', hourlyCost: 0.768, cpuCount: 16, ramGiB: 64, performance: 6.8}),
    makeInstanceType({id: 'M5a12xlarge', name: 'm5a.12xlarge', hourlyCost: 2.304, cpuCount: 48, ramGiB: 192, performance: 16.4}),
    makeInstanceType({id: 'M5a16xlarge', name: 'm5a.16xlarge', hourlyCost: 3.072, cpuCount: 64, ramGiB: 256, performance: 19.9}),
    makeInstanceType({id: 'C4Large', name: 'c4.large', hourlyCost: 0.113, cpuCount: 2, ramGiB: 3.75, performance: 1.2}),
    makeInstanceType({id: 'C4Xlarge', name: 'c4.xlarge', hourlyCost: 0.226, cpuCount: 4, ramGiB: 7.5, performance: 2.3}),
    makeInstanceType({id: 'C42xlarge', name: 'c4.2xlarge', hourlyCost: 0.453, cpuCount: 8, ramGiB: 15, performance: 4.5}),
    makeInstanceType({id: 'C44xlarge', name: 'c4.4xlarge', hourlyCost: 0.905, cpuCount: 16, ramGiB: 30, performance: 8.4}),
    makeInstanceType({id: 'C48xlarge', name: 'c4.8xlarge', hourlyCost: 1.811, cpuCount: 36, ramGiB: 60, performance: 16.6}),
    makeInstanceType({id: 'C5Large', name: 'c5.large', hourlyCost: 0.096, cpuCount: 2, ramGiB: 4, performance: 1.2}),
    makeInstanceType({id: 'C5Xlarge', name: 'c5.xlarge', hourlyCost: 0.192, cpuCount: 4, ramGiB: 8, performance: 2.5}),
    makeInstanceType({id: 'C52xlarge', name: 'c5.2xlarge', hourlyCost: 0.384, cpuCount: 8, ramGiB: 16, performance: 4.8}),
    makeInstanceType({id: 'C54xlarge', name: 'c5.4xlarge', hourlyCost: 0.768, cpuCount: 16, ramGiB: 32, performance: 8.9}),
    makeInstanceType({id: 'C59xlarge', name: 'c5.9xlarge', hourlyCost: 1.728, cpuCount: 36, ramGiB: 72, performance: 16.3}),
    makeInstanceType({id: 'R4Large', name: 'r4.large', hourlyCost: 0.148, cpuCount: 2, ramGiB: 15.25, performance: 0.9}),
    makeInstanceType({id: 'R4Xlarge', name: 'r4.xlarge', hourlyCost: 0.296, cpuCount: 4, ramGiB: 30.5, performance: 1.7}),
    makeInstanceType({id: 'R42xlarge', name: 'r4.2xlarge', hourlyCost: 0.593, cpuCount: 8, ramGiB: 61, performance: 3.3}),
    makeInstanceType({id: 'R44xlarge', name: 'r4.4xlarge', hourlyCost: 1.186, cpuCount: 16, ramGiB: 122, performance: 6.2}),
    makeInstanceType({id: 'R48xlarge', name: 'r4.8xlarge', hourlyCost: 2.371, cpuCount: 32, ramGiB: 244, performance: 10.9}),
    makeInstanceType({id: 'R416xlarge', name: 'r4.16xlarge', hourlyCost: 4.742, cpuCount: 64, ramGiB: 488, performance: 17.4}),
    makeInstanceType({id: 'R5Large', name: 'r5.large', hourlyCost: 0.141, cpuCount: 2, ramGiB: 16, performance: 1.1}),
    makeInstanceType({id: 'R5Xlarge', name: 'r5.xlarge', hourlyCost: 0.282, cpuCount: 4, ramGiB: 32, performance: 2.1}),
    makeInstanceType({id: 'R52xlarge', name: 'r5.2xlarge', hourlyCost: 0.564, cpuCount: 8, ramGiB: 64, performance: 4.1}),
    makeInstanceType({id: 'R54xlarge', name: 'r5.4xlarge', hourlyCost: 1.128, cpuCount: 16, ramGiB: 128, performance: 7.7}),
    makeInstanceType({id: 'R58xlarge', name: 'r5.8xlarge', hourlyCost: 2.256, cpuCount: 32, ramGiB: 256, performance: 14.2}),
    makeInstanceType({id: 'R516xlarge', name: 'r5.16xlarge', hourlyCost: 4.512, cpuCount: 64, ramGiB: 512, performance: 22.8}),
    // GPU types
    makeInstanceType({id: 'G5Xlarge', name: 'g5.xlarge', tag: 'g4', hourlyCost: 1.123, cpuCount: 4, gpuCount: 1, ramGiB: 16, performance: 3.0, ssdGB: 250}),
    makeInstanceType({id: 'G52xlarge', name: 'g5.2xlarge', tag: 'g8', hourlyCost: 1.353, cpuCount: 8, gpuCount: 1, ramGiB: 32, performance: 5.7, ssdGB: 450}),
    makeInstanceType({id: 'G512xlarge', name: 'g5.12xlarge', tag: 'g48', hourlyCost: 6.332, cpuCount: 48, gpuCount: 4, ramGiB: 192, performance: 24.8, ssdGB: 3800}),
]
