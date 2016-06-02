package org.openforis.sepal.component.budget.internal

import groovy.time.TimeCategory
import org.openforis.sepal.component.budget.api.InstanceUse
import org.openforis.sepal.util.DateTime

class InstanceSpendingCalculator {
    private final Map<String, Double> hourlyCostByInstanceType

    InstanceSpendingCalculator(Map<String, Double> hourlyCostByInstanceType) {
        this.hourlyCostByInstanceType = hourlyCostByInstanceType
    }

    double calculate(int year, int month, List<InstanceUse> instanceUses) {
        def firstOfMonth = DateTime.parseDateString("$year-$month-1")
        return instanceUses.collect {
            def hours = hoursToCharge(it, firstOfMonth)
            def hourlyCost = hourlyCostByInstanceType[it.instanceType]
            hours * hourlyCost
        }?.sum() ?: 0 as double
    }

    private double hoursToCharge(InstanceUse instanceUse, Date firstOfMonth) {
        def endOfMonth = use(TimeCategory) { firstOfMonth + 1.month }
        def from = [instanceUse.from, firstOfMonth].max()
        def to = [instanceUse.to, endOfMonth].min()
        if (from > to)
            return 0
        Math.ceil(DateTime.hoursBetween(from, to))
    }
}
