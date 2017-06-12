package component.workersession

import org.openforis.sepal.component.hostingservice.api.InstanceType
import org.openforis.sepal.component.workersession.api.Spending

class GenerateUserSessionReport_Test extends AbstractWorkerSessionTest {
    def 'When generating report, instance types and their types are included'() {
        instanceManager.instanceTypes = [new InstanceType(id: 'some-instance')]

        when:
        def report = generateUserSessionReport()

        then:
        report.instanceTypes == instanceManager.instanceTypes
    }

    def 'When generating report, user budget and spending is included'() {
        def spending = new Spending(monthlyInstanceBudget: 123)
        setUserSpending(spending)

        when:
        def report = generateUserSessionReport()

        then:
        report.spending == spending
    }

    def 'Given a session, when generating report, session is included'() {
        def session = activeSession()

        when:
        def report = generateUserSessionReport()

        then:
        report.sessions == [session]
    }

    def 'Given a session for another worker type, when generating report, session is not included'() {
        activeSession(workerType: 'another-worker-type')

        when:
        def report = generateUserSessionReport()

        then:
        report.sessions == []
    }

    def 'Given a session for another user, when generating report, session is not included'() {
        activeSession(username: 'another-username')

        when:
        def report = generateUserSessionReport()

        then:
        report.sessions == []
    }
}
