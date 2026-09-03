import {firstOfYearMonth, hoursBetween, monthOfYear as monthOf, plusOneMonth, year as yearOf} from './dateTime.js'

const maxDate = (a, b) => (a.getTime() >= b.getTime() ? a : b)
const minDate = (a, b) => (a.getTime() <= b.getTime() ? a : b)

// Hours are ceiled per use record, not on the month's summed hours.
const hoursToCharge = (instanceUse, firstOfMonth, endOfMonth) => {
    const from = maxDate(instanceUse.from, firstOfMonth)
    const to = minDate(instanceUse.to, endOfMonth)
    if (from.getTime() > to.getTime()) {
        return 0
    }
    return Math.ceil(hoursBetween(from, to))
}

const calculate = (year, month, instanceUses, hourlyCostByInstanceType) => {
    const firstOfMonth = firstOfYearMonth(year, month)
    const endOfMonth = plusOneMonth(firstOfMonth)
    return instanceUses.reduce((total, instanceUse) => {
        const hours = hoursToCharge(instanceUse, firstOfMonth, endOfMonth)
        const hourlyCost = hourlyCostByInstanceType[instanceUse.instanceType] ?? 0
        return total + hours * hourlyCost
    }, 0)
}

const instanceSpending = async (
    budgetRepository,
    username,
    hourlyCostByInstanceType,
    clock = () => new Date()
) => {
    const now = clock()
    const year = yearOf(now)
    const month = monthOf(now)
    const instanceUses = await budgetRepository.userInstanceUses(username, year, month)
    return calculate(year, month, instanceUses, hourlyCostByInstanceType)
}

export {calculate, instanceSpending}
