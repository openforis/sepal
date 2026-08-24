// GenerateUserUsageReport — time-weighted per-instance-type resource usage for one user over
// the last `days`, from the instance_usage_hourly rollups.
//
// Weighted average = Σ(metric·sample_count) / Σ(sample_count over rows where the metric
// was measured) — computed per type by the repository, re-weighted here for the overall
// row. A metric with zero weight (never measured — realistically only GPU) is null;
// no rows at all → overall: null.

const DAY_MS = 24 * 3600_000

const round2 = value => Math.round((value + Number.EPSILON) * 100) / 100

const avgMax = (sum, weight, max) =>
    weight ? {avg: round2(sum / weight), max} : null

const maxOrNull = (a, b) => {
    const max = Math.max(a ?? -1, b ?? -1)
    return max < 0 ? null : max
}

const asReportRow = ({hours, cpuWeight, cpuSum, cpuMax, ramWeight, ramSum, ramMax, gpuWeight, gpuSum, gpuMax, netWeight, netSum}) => ({
    hours,
    cpu: avgMax(cpuSum, cpuWeight, cpuMax),
    ram: avgMax(ramSum, ramWeight, ramMax),
    gpu: avgMax(gpuSum, gpuWeight, gpuMax),
    netBytesPerS: netWeight ? Math.round(netSum / netWeight) : null,
})

const generateUserUsageReport = async (
    {username, days}, {usageRepo, instanceManager, clock = () => new Date()}
) => {
    const fromTime = new Date(clock().getTime() - days * DAY_MS)
    const rows = await usageRepo.userUsageRollup(username, fromTime)
    const nameById = Object.fromEntries(
        instanceManager.getInstanceTypes().map(({id, name}) => [id, name]))
    const overall = rows.length
        ? asReportRow(rows.reduce((acc, row) => ({
            hours: acc.hours + row.hours,
            cpuWeight: acc.cpuWeight + row.cpuWeight, cpuSum: acc.cpuSum + row.cpuSum,
            cpuMax: maxOrNull(acc.cpuMax, row.cpuMax),
            ramWeight: acc.ramWeight + row.ramWeight, ramSum: acc.ramSum + row.ramSum,
            ramMax: maxOrNull(acc.ramMax, row.ramMax),
            gpuWeight: acc.gpuWeight + row.gpuWeight, gpuSum: acc.gpuSum + row.gpuSum,
            gpuMax: maxOrNull(acc.gpuMax, row.gpuMax),
            netWeight: acc.netWeight + row.netWeight, netSum: acc.netSum + row.netSum,
        }), {hours: 0, cpuWeight: 0, cpuSum: 0, cpuMax: null, ramWeight: 0, ramSum: 0, ramMax: null,
            gpuWeight: 0, gpuSum: 0, gpuMax: null, netWeight: 0, netSum: 0}))
        : null
    return {
        days,
        overall,
        byInstanceType: rows.map(row => ({
            instanceType: row.instanceType,
            name: nameById[row.instanceType] ?? row.instanceType,
            ...asReportRow(row),
        })),
    }
}

export {generateUserUsageReport}
