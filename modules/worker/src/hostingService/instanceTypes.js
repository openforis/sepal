// InstanceType catalog.
//
// Field semantics:
//   id          — stable identifier used across the codebase and DB
//   name        — AWS EC2 instance type string (or display name for local)
//   tag         — short tag used for pool targeting (undefined = not pooled idle)
//   cpuCount    — vCPU count
//   ramGiB      — RAM in gibibytes
//   hourlyCost  — USD/hr on-demand price
//   idleCount   — target idle pool size (undefined = 0, i.e. 0 warm)
//   devices     — host device paths to pass through (undefined = none, e.g. GPU)
//   gpuCount    — GPU count (default 0)
//
// Derived:
//   description — "$cpuCount CPU, $ramGiB GiB" ("$gpuCount GPU" after the CPU count when gpuCount > 0)
//   ramBytes    — ramGiB * 2^30

const makeInstanceType = ({id, name, tag, cpuCount, ramGiB, hourlyCost, idleCount, devices, gpuCount}) => ({
    id,
    name,
    tag,
    cpuCount,
    ramGiB,
    hourlyCost,
    idleCount: idleCount ?? 0,
    devices: devices ?? [],
    gpuCount: gpuCount ?? 0,
    get description() { return `${cpuCount} CPU, ${gpuCount ? `${gpuCount} GPU, ` : ''}${ramGiB} GiB` },
    get ramBytes() { return ramGiB * Math.pow(2, 30) },
})

// ─── AWS instance catalog (62 types) ─────────────────────────────────────────
const AWS_INSTANCE_TYPES = [
    // Current generation — AMD Graviton/AMD Milan/Genoa (tagged, actively pooled)
    makeInstanceType({id: 'T3aSmall', name: 't3a.small', tag: 't1', hourlyCost: 0.0204, cpuCount: 1, ramGiB: 2, idleCount: 1}),
    makeInstanceType({id: 'T3aMedium', name: 't3a.medium', tag: 't2', hourlyCost: 0.0408, cpuCount: 2, ramGiB: 4}),
    makeInstanceType({id: 'M6aLarge', name: 'm6a.large', tag: 'm2', hourlyCost: 0.0963, cpuCount: 2, ramGiB: 8}),
    makeInstanceType({id: 'M6aXlarge', name: 'm6a.xlarge', tag: 'm4', hourlyCost: 0.1926, cpuCount: 4, ramGiB: 16}),
    makeInstanceType({id: 'M6a2xlarge', name: 'm6a.2xlarge', tag: 'm8', hourlyCost: 0.3852, cpuCount: 8, ramGiB: 32}),
    makeInstanceType({id: 'M6a4xlarge', name: 'm6a.4xlarge', tag: 'm16', hourlyCost: 0.7704, cpuCount: 16, ramGiB: 64}),
    makeInstanceType({id: 'M6a12xlarge', name: 'm6a.12xlarge', tag: 'm48', hourlyCost: 2.3112, cpuCount: 48, ramGiB: 192}),
    makeInstanceType({id: 'M6a16xlarge', name: 'm6a.16xlarge', tag: 'm64', hourlyCost: 3.0816, cpuCount: 64, ramGiB: 256}),
    makeInstanceType({id: 'C7aLarge', name: 'c7a.large', tag: 'c2', hourlyCost: 0.11012, cpuCount: 2, ramGiB: 4}),
    makeInstanceType({id: 'C7aXlarge', name: 'c7a.xlarge', tag: 'c4', hourlyCost: 0.22024, cpuCount: 4, ramGiB: 8}),
    makeInstanceType({id: 'C7a2xlarge', name: 'c7a.2xlarge', tag: 'c8', hourlyCost: 0.44048, cpuCount: 8, ramGiB: 16}),
    makeInstanceType({id: 'C7a4xlarge', name: 'c7a.4xlarge', tag: 'c16', hourlyCost: 0.88096, cpuCount: 16, ramGiB: 32}),
    makeInstanceType({id: 'C7a8xlarge', name: 'c7a.8xlarge', tag: 'c32', hourlyCost: 1.76192, cpuCount: 32, ramGiB: 64}),
    makeInstanceType({id: 'C7a12xlarge', name: 'c7a.12xlarge', tag: 'c48', hourlyCost: 2.64288, cpuCount: 48, ramGiB: 96}),
    makeInstanceType({id: 'C7a16xlarge', name: 'c7a.16xlarge', tag: 'c64', hourlyCost: 3.52384, cpuCount: 64, ramGiB: 128}),
    makeInstanceType({id: 'R6aLarge', name: 'r6a.large', tag: 'r2', hourlyCost: 0.1269, cpuCount: 2, ramGiB: 16}),
    makeInstanceType({id: 'R6aXlarge', name: 'r6a.xlarge', tag: 'r4', hourlyCost: 0.2538, cpuCount: 4, ramGiB: 32}),
    makeInstanceType({id: 'R6a2xlarge', name: 'r6a.2xlarge', tag: 'r8', hourlyCost: 0.5076, cpuCount: 8, ramGiB: 64}),
    makeInstanceType({id: 'R6a4xlarge', name: 'r6a.4xlarge', tag: 'r16', hourlyCost: 1.0152, cpuCount: 16, ramGiB: 128}),
    makeInstanceType({id: 'R6a8xlarge', name: 'r6a.8xlarge', tag: 'r32', hourlyCost: 2.0304, cpuCount: 32, ramGiB: 256}),
    makeInstanceType({id: 'R6a16xlarge', name: 'r6a.16xlarge', tag: 'r64', hourlyCost: 4.0608, cpuCount: 64, ramGiB: 512}),
    makeInstanceType({id: 'X116xlarge', name: 'x1.16xlarge', tag: 'x64', hourlyCost: 8.003, cpuCount: 64, ramGiB: 976}),
    makeInstanceType({id: 'X132xlarge', name: 'x1.32xlarge', tag: 'x128', hourlyCost: 16.006, cpuCount: 128, ramGiB: 1920}),
    // Older / legacy generation (no tag — not pooled idle)
    makeInstanceType({id: 'T2Small', name: 't2.small', hourlyCost: 0.025, cpuCount: 1, ramGiB: 2}),
    makeInstanceType({id: 'M3Medium', name: 'm3.medium', hourlyCost: 0.073, cpuCount: 1, ramGiB: 3.75}),
    makeInstanceType({id: 'M4Large', name: 'm4.large', hourlyCost: 0.119, cpuCount: 2, ramGiB: 8}),
    makeInstanceType({id: 'M4Xlarge', name: 'm4.xlarge', hourlyCost: 0.238, cpuCount: 4, ramGiB: 16}),
    makeInstanceType({id: 'M42xlarge', name: 'm4.2xlarge', hourlyCost: 0.475, cpuCount: 8, ramGiB: 32}),
    makeInstanceType({id: 'M44xlarge', name: 'm4.4xlarge', hourlyCost: 0.95, cpuCount: 16, ramGiB: 64}),
    makeInstanceType({id: 'M410xlarge', name: 'm4.10xlarge', hourlyCost: 2.377, cpuCount: 40, ramGiB: 160}),
    makeInstanceType({id: 'M416xlarge', name: 'm4.16xlarge', hourlyCost: 3.803, cpuCount: 64, ramGiB: 256}),
    makeInstanceType({id: 'M5aLarge', name: 'm5a.large', hourlyCost: 0.096, cpuCount: 2, ramGiB: 8}),
    makeInstanceType({id: 'M5aXlarge', name: 'm5a.xlarge', hourlyCost: 0.192, cpuCount: 4, ramGiB: 16}),
    makeInstanceType({id: 'M5a2xlarge', name: 'm5a.2xlarge', hourlyCost: 0.384, cpuCount: 8, ramGiB: 32}),
    makeInstanceType({id: 'M5a4xlarge', name: 'm5a.4xlarge', hourlyCost: 0.768, cpuCount: 16, ramGiB: 64}),
    makeInstanceType({id: 'M5a12xlarge', name: 'm5a.12xlarge', hourlyCost: 2.304, cpuCount: 48, ramGiB: 192}),
    makeInstanceType({id: 'M5a16xlarge', name: 'm5a.16xlarge', hourlyCost: 3.072, cpuCount: 64, ramGiB: 256}),
    makeInstanceType({id: 'C4Large', name: 'c4.large', hourlyCost: 0.113, cpuCount: 2, ramGiB: 3.75}),
    makeInstanceType({id: 'C4Xlarge', name: 'c4.xlarge', hourlyCost: 0.226, cpuCount: 4, ramGiB: 7.5}),
    makeInstanceType({id: 'C42xlarge', name: 'c4.2xlarge', hourlyCost: 0.453, cpuCount: 8, ramGiB: 15}),
    makeInstanceType({id: 'C44xlarge', name: 'c4.4xlarge', hourlyCost: 0.905, cpuCount: 16, ramGiB: 30}),
    makeInstanceType({id: 'C48xlarge', name: 'c4.8xlarge', hourlyCost: 1.811, cpuCount: 36, ramGiB: 60}),
    makeInstanceType({id: 'C5Large', name: 'c5.large', hourlyCost: 0.096, cpuCount: 2, ramGiB: 4}),
    makeInstanceType({id: 'C5Xlarge', name: 'c5.xlarge', hourlyCost: 0.192, cpuCount: 4, ramGiB: 8}),
    makeInstanceType({id: 'C52xlarge', name: 'c5.2xlarge', hourlyCost: 0.384, cpuCount: 8, ramGiB: 16}),
    makeInstanceType({id: 'C54xlarge', name: 'c5.4xlarge', hourlyCost: 0.768, cpuCount: 16, ramGiB: 32}),
    makeInstanceType({id: 'C59xlarge', name: 'c5.9xlarge', hourlyCost: 1.728, cpuCount: 36, ramGiB: 72}),
    makeInstanceType({id: 'R4Large', name: 'r4.large', hourlyCost: 0.148, cpuCount: 2, ramGiB: 15.25}),
    makeInstanceType({id: 'R4Xlarge', name: 'r4.xlarge', hourlyCost: 0.296, cpuCount: 4, ramGiB: 30.5}),
    makeInstanceType({id: 'R42xlarge', name: 'r4.2xlarge', hourlyCost: 0.593, cpuCount: 8, ramGiB: 61}),
    makeInstanceType({id: 'R44xlarge', name: 'r4.4xlarge', hourlyCost: 1.186, cpuCount: 16, ramGiB: 122}),
    makeInstanceType({id: 'R48xlarge', name: 'r4.8xlarge', hourlyCost: 2.371, cpuCount: 32, ramGiB: 244}),
    makeInstanceType({id: 'R416xlarge', name: 'r4.16xlarge', hourlyCost: 4.742, cpuCount: 64, ramGiB: 488}),
    makeInstanceType({id: 'R5Large', name: 'r5.large', hourlyCost: 0.141, cpuCount: 2, ramGiB: 16}),
    makeInstanceType({id: 'R5Xlarge', name: 'r5.xlarge', hourlyCost: 0.282, cpuCount: 4, ramGiB: 32}),
    makeInstanceType({id: 'R52xlarge', name: 'r5.2xlarge', hourlyCost: 0.564, cpuCount: 8, ramGiB: 64}),
    makeInstanceType({id: 'R54xlarge', name: 'r5.4xlarge', hourlyCost: 1.128, cpuCount: 16, ramGiB: 128}),
    makeInstanceType({id: 'R58xlarge', name: 'r5.8xlarge', hourlyCost: 2.256, cpuCount: 32, ramGiB: 256}),
    makeInstanceType({id: 'R516xlarge', name: 'r5.16xlarge', tag: 'r64', hourlyCost: 4.512, cpuCount: 64, ramGiB: 512}),
    // GPU types
    makeInstanceType({id: 'G5Xlarge', name: 'g5.xlarge', tag: 'g4', hourlyCost: 1.123, cpuCount: 4, gpuCount: 1, ramGiB: 16}),
    makeInstanceType({id: 'G52xlarge', name: 'g5.2xlarge', tag: 'g8', hourlyCost: 1.353, cpuCount: 8, gpuCount: 1, ramGiB: 32}),
    makeInstanceType({id: 'G512xlarge', name: 'g5.12xlarge', tag: 'g48', hourlyCost: 6.332, cpuCount: 48, gpuCount: 4, ramGiB: 192}),
]

// ─── Local instance catalog (43 types) ────────────────────────────────────────
const LOCAL_INSTANCE_TYPES = [
    // Current generation (tagged, actively pooled)
    makeInstanceType({id: 'T3aSmall', name: 't3a.small', tag: 't1', hourlyCost: 0.0204, cpuCount: 1, ramGiB: 2, idleCount: 1}),
    makeInstanceType({id: 'T3aMedium', name: 't3a.medium', tag: 't2', hourlyCost: 0.0408, cpuCount: 2, ramGiB: 4}),
    makeInstanceType({id: 'M5aLarge', name: 'm5a.large', tag: 'm2', hourlyCost: 0.096, cpuCount: 2, ramGiB: 8}),
    makeInstanceType({id: 'M5aXlarge', name: 'm5a.xlarge', tag: 'm4', hourlyCost: 0.192, cpuCount: 4, ramGiB: 16}),
    makeInstanceType({id: 'M5a2xlarge', name: 'm5a.2xlarge', tag: 'm8', hourlyCost: 0.384, cpuCount: 8, ramGiB: 32}),
    makeInstanceType({id: 'M5a4xlarge', name: 'm5a.4xlarge', tag: 'm16', hourlyCost: 0.768, cpuCount: 16, ramGiB: 64}),
    makeInstanceType({id: 'M5a12xlarge', name: 'm5a.12xlarge', tag: 'm48', hourlyCost: 2.304, cpuCount: 48, ramGiB: 192}),
    makeInstanceType({id: 'M5a16xlarge', name: 'm5a.16xlarge', tag: 'm64', hourlyCost: 3.072, cpuCount: 64, ramGiB: 256}),
    makeInstanceType({id: 'C5Large', name: 'c5.large', tag: 'c2', hourlyCost: 0.096, cpuCount: 2, ramGiB: 4}),
    makeInstanceType({id: 'C5Xlarge', name: 'c5.xlarge', tag: 'c4', hourlyCost: 0.192, cpuCount: 4, ramGiB: 8}),
    makeInstanceType({id: 'C52xlarge', name: 'c5.2xlarge', tag: 'c8', hourlyCost: 0.384, cpuCount: 8, ramGiB: 16}),
    makeInstanceType({id: 'C54xlarge', name: 'c5.4xlarge', tag: 'c16', hourlyCost: 0.768, cpuCount: 16, ramGiB: 32}),
    makeInstanceType({id: 'C59xlarge', name: 'c5.9xlarge', tag: 'c36', hourlyCost: 1.728, cpuCount: 36, ramGiB: 72}),
    makeInstanceType({id: 'R5Large', name: 'r5.large', tag: 'r2', hourlyCost: 0.141, cpuCount: 2, ramGiB: 16}),
    makeInstanceType({id: 'R5Xlarge', name: 'r5.xlarge', tag: 'r4', hourlyCost: 0.282, cpuCount: 4, ramGiB: 32}),
    makeInstanceType({id: 'R52xlarge', name: 'r5.2xlarge', tag: 'r8', hourlyCost: 0.564, cpuCount: 8, ramGiB: 64}),
    makeInstanceType({id: 'R54xlarge', name: 'r5.4xlarge', tag: 'r16', hourlyCost: 1.128, cpuCount: 16, ramGiB: 128}),
    makeInstanceType({id: 'R58xlarge', name: 'r5.8xlarge', tag: 'r32', hourlyCost: 2.256, cpuCount: 32, ramGiB: 256}),
    makeInstanceType({id: 'R516xlarge', name: 'r5.16xlarge', tag: 'r64', hourlyCost: 4.512, cpuCount: 64, ramGiB: 512}),
    makeInstanceType({id: 'X116xlarge', name: 'x1.16xlarge', tag: 'x64', hourlyCost: 8.003, cpuCount: 64, ramGiB: 976}),
    makeInstanceType({id: 'X132xlarge', name: 'x1.32xlarge', tag: 'x128', hourlyCost: 16.006, cpuCount: 128, ramGiB: 1920}),
    // Older / legacy generation (no tag — not pooled idle)
    makeInstanceType({id: 'T2Small', name: 't2.small', hourlyCost: 0.025, cpuCount: 1, ramGiB: 2}),
    makeInstanceType({id: 'M3Medium', name: 'm3.medium', hourlyCost: 0.073, cpuCount: 1, ramGiB: 3.75}),
    makeInstanceType({id: 'M4Large', name: 'm4.large', hourlyCost: 0.119, cpuCount: 2, ramGiB: 8}),
    makeInstanceType({id: 'M4Xlarge', name: 'm4.xlarge', hourlyCost: 0.238, cpuCount: 4, ramGiB: 16}),
    makeInstanceType({id: 'M42xlarge', name: 'm4.2xlarge', hourlyCost: 0.475, cpuCount: 8, ramGiB: 32}),
    makeInstanceType({id: 'M44xlarge', name: 'm4.4xlarge', hourlyCost: 0.95, cpuCount: 16, ramGiB: 64}),
    makeInstanceType({id: 'M410xlarge', name: 'm4.10xlarge', hourlyCost: 2.377, cpuCount: 40, ramGiB: 160}),
    makeInstanceType({id: 'M416xlarge', name: 'm4.16xlarge', hourlyCost: 3.803, cpuCount: 64, ramGiB: 256}),
    makeInstanceType({id: 'C4Large', name: 'c4.large', hourlyCost: 0.113, cpuCount: 2, ramGiB: 3.75}),
    makeInstanceType({id: 'C4Xlarge', name: 'c4.xlarge', hourlyCost: 0.226, cpuCount: 4, ramGiB: 7.5}),
    makeInstanceType({id: 'C42xlarge', name: 'c4.2xlarge', hourlyCost: 0.453, cpuCount: 8, ramGiB: 15}),
    makeInstanceType({id: 'C44xlarge', name: 'c4.4xlarge', hourlyCost: 0.905, cpuCount: 16, ramGiB: 30}),
    makeInstanceType({id: 'C48xlarge', name: 'c4.8xlarge', hourlyCost: 1.811, cpuCount: 36, ramGiB: 60}),
    makeInstanceType({id: 'R4Large', name: 'r4.large', hourlyCost: 0.148, cpuCount: 2, ramGiB: 15.25}),
    makeInstanceType({id: 'R4Xlarge', name: 'r4.xlarge', hourlyCost: 0.296, cpuCount: 4, ramGiB: 30.5}),
    makeInstanceType({id: 'R42xlarge', name: 'r4.2xlarge', hourlyCost: 0.593, cpuCount: 8, ramGiB: 61}),
    makeInstanceType({id: 'R44xlarge', name: 'r4.4xlarge', hourlyCost: 1.186, cpuCount: 16, ramGiB: 122}),
    makeInstanceType({id: 'R48xlarge', name: 'r4.8xlarge', hourlyCost: 2.371, cpuCount: 32, ramGiB: 244}),
    makeInstanceType({id: 'R416xlarge', name: 'r4.16xlarge', hourlyCost: 4.742, cpuCount: 64, ramGiB: 488}),
    // GPU types
    makeInstanceType({id: 'G5Xlarge', name: 'g5.xlarge', tag: 'g4', hourlyCost: 1.123, cpuCount: 4, gpuCount: 1, ramGiB: 16}),
    makeInstanceType({id: 'G52xlarge', name: 'g5.2xlarge', tag: 'g8', hourlyCost: 1.353, cpuCount: 8, gpuCount: 1, ramGiB: 32}),
    makeInstanceType({id: 'G512xlarge', name: 'g5.12xlarge', tag: 'g48', hourlyCost: 6.332, cpuCount: 48, gpuCount: 4, ramGiB: 192}),
]

export {AWS_INSTANCE_TYPES, LOCAL_INSTANCE_TYPES}
