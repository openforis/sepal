package component.budget

import org.openforis.sepal.component.budget.api.InstanceUse
import org.openforis.sepal.component.budget.internal.InstanceSpendingCalculator
import org.openforis.sepal.util.DateTime
import spock.lang.Specification

import java.text.SimpleDateFormat

class InstanceSpendingCalculator_Test extends Specification {
    def instanceTypes = [:]

    def 'Given no use, cost is 0'() {
        expect:
        calculate() == 0
    }

    def 'Given 2 hours use for 3 USD, cost is 6'() {
        expect:
        calculate(2016, 1,
                use(start: '2016-01-01', duration: 2, cost: 3)
        ) == 6
    }

    def 'Given 2 hours use for 3 USD and 4 hours use for 7 USD, cost is 34'() {
        expect:
        calculate(2016, 1,
                use(start: '2016-01-01', duration: 2, cost: 3),
                use(start: '2016-01-01', duration: 4, cost: 7)
        ) == 34
    }

    def 'Given use before year/month, cost is 0'() {
        expect:
        calculate(2016, 1,
                use(start: '2015-05-05', duration: 2, cost: 3)
        ) == 0
    }

    def 'Given 1 hour use before year/month and 1 during for 1 USD, cost is 1'() {
        expect:
        calculate(2016, 1,
                use(start: '2015-12-31 23:00:00', duration: 2, cost: 1)
        ) == 1
    }

    def 'Given use after year/month, cost is 0'() {
        expect:
        calculate(2016, 1,
                use(start: '2017-05-05', duration: 2, cost: 3)
        ) == 0
    }

    def 'Given 1 hour use during year/month and 1 after for 1 USD, cost is 1'() {
        expect:
        calculate(2016, 1,
                use(start: '2016-01-31 23:00:00', duration: 2, cost: 1)
        ) == 1
    }

    def 'Given spending before year/month until after 1 USD in a 31 day month, cost is 31 * 24 * 1 = 744'() {
        expect:
        calculate(2016, 1,
                use(start: '2015-12-01', duration: 2000, cost: 1)
        ) == 744
    }

    InstanceUse use(Map args) {
        String start = args.start
        double durationHours = args.duration
        double hourlyCost = args.cost
        def instanceType = "type-costing-$hourlyCost"
        instanceTypes[instanceType] = hourlyCost
        def from = start.length() == 10 ?
                DateTime.parseDateString(start) :
                new SimpleDateFormat('yyyy-MM-dd HH:mm:ss').parse(start)
        def to = new Date(from.time + (durationHours * 60 * 60 * 1000 as long))
        new InstanceUse(instanceType: instanceType, from: from, to: to)
    }

    double calculate(int year = 2016, int month = 1, InstanceUse... instanceUses) {
        new InstanceSpendingCalculator(instanceTypes).calculate(year, month, instanceUses as List)
    }
}
