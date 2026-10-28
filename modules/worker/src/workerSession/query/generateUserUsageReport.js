// GenerateUserUsageReport — time-weighted per-instance-type resource usage for one user, month by
// month, from the instance_usage_hourly rollups. Months are UTC calendar months ('YYYY-MM'), the
// ones the monthly budgets run on, newest first: the current one so far, back to the oldest one the
// hourly retention keeps whole. Only months with recorded usage are reported.
//
// Weighted average = Σ(metric·sample_count) / Σ(sample_count over rows where the metric
// was measured) — computed per type by the repository, re-weighted here for the overall
// row. A metric with zero weight (never measured — realistically only GPU) is null.
//
// cost prices the hours shown at the type's hourly rate. An hour counts once any sample fell in it,
// so a partial hour is priced in full: an estimate for comparing types, not the billed spending. A
// retired type has no rate and no cost; overall sums the types that have one.

import {round2} from '../../round.js'
import {DAY_MS} from '../../time.js'

const generateUserUsageReport = async (
    {username}, {usageRepo, instanceManager, clock, hourlyRetentionDays}
) => {
    const now = clock()
    const lastMonth = monthOf(now)
    const firstMonth = minMonth(oldestWholeMonth(new Date(now.getTime() - hourlyRetentionDays * DAY_MS)), lastMonth)
    const instanceTypeById = Object.fromEntries(
        instanceManager.getInstanceTypes().map(instanceType => [instanceType.id, instanceType]))
    const months = []
    for (let month = lastMonth; month >= firstMonth; month = previousMonth(month)) {
        const rows = await usageRepo.userUsageRollup(username, monthStart(month), monthStart(nextMonth(month)))
        if (rows.length) {
            months.push({month, ...monthReport(rows, instanceTypeById)})
        }
    }
    return {months}
}

const monthReport = (rows, instanceTypeById) => {
    const byInstanceType = rows.map(row => ({
        instanceType: row.instanceType,
        name: instanceTypeById[row.instanceType]?.name ?? row.instanceType,
        tag: instanceTypeById[row.instanceType]?.tag ?? null,
        ...asReportRow(row),
        cost: cost(row.hours, instanceTypeById[row.instanceType]?.hourlyCost),
    }))
    const overall = asReportRow(rows.reduce((acc, row) => ({
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
    return {
        overall: {
            ...overall,
            cost: round2(byInstanceType.reduce((sum, {cost}) => sum + (cost ?? 0), 0)),
        },
        byInstanceType,
    }
}

// 'YYYY-MM' compares in calendar order as a string.
const monthOf = date =>
    date.toISOString().slice(0, 7)

const monthStart = month =>
    new Date(`${month}-01T00:00:00Z`)

const nextMonth = month =>
    addMonths(month, 1)

const previousMonth = month =>
    addMonths(month, -1)

const addMonths = (month, count) => {
    const start = monthStart(month)
    return monthOf(new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + count, 1)))
}

const oldestWholeMonth = retainedFrom => {
    const month = monthOf(retainedFrom)
    return monthStart(month).getTime() === retainedFrom.getTime() ? month : nextMonth(month)
}

const minMonth = (a, b) => a < b ? a : b

const cost = (hours, hourlyCost) =>
    hourlyCost == null ? null : round2(hours * hourlyCost)

const asReportRow = ({hours, cpuWeight, cpuSum, cpuMax, ramWeight, ramSum, ramMax, gpuWeight, gpuSum, gpuMax, netWeight, netSum}) => ({
    hours,
    cpu: avgMax(cpuSum, cpuWeight, cpuMax),
    ram: avgMax(ramSum, ramWeight, ramMax),
    gpu: avgMax(gpuSum, gpuWeight, gpuMax),
    netBytesPerS: netWeight ? Math.round(netSum / netWeight) : null,
})

const avgMax = (sum, weight, max) =>
    weight ? {avg: round2(sum / weight), max} : null

const maxOrNull = (a, b) => {
    const max = Math.max(a ?? -1, b ?? -1)
    return max < 0 ? null : max
}

export {generateUserUsageReport}
