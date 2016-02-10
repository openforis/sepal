package org.openforis.sepal.component.sandboxmanager.query

import groovy.transform.ToString
import org.openforis.sepal.component.sandboxmanager.SandboxSession
import org.openforis.sepal.component.sandboxmanager.SessionRepository
import org.openforis.sepal.component.sandboxmanager.UserBudgetRepository
import org.openforis.sepal.hostingservice.WorkerInstanceManager
import org.openforis.sepal.hostingservice.WorkerInstanceType
import org.openforis.sepal.query.Query
import org.openforis.sepal.query.QueryHandler
import org.openforis.sepal.user.UserRepository
import org.openforis.sepal.util.Clock

import java.time.ZoneId

import static groovymvc.validate.Constraints.custom
import static org.openforis.sepal.hostingservice.Status.ACTIVE
import static org.openforis.sepal.hostingservice.Status.STARTING

@ToString
class LoadSandboxInfo implements Query<SandboxInfo> {
    String username

    static constraints(UserRepository userRepository) {
        [username: custom { userRepository.contains(it) }]
    }
}


@ToString
class LoadSandboxInfoHandler implements QueryHandler<SandboxInfo, LoadSandboxInfo> {
    private final SessionRepository sessionRepository
    private final WorkerInstanceManager instanceProvider
    private final UserBudgetRepository userBudgetRepository
    private final Clock clock

    LoadSandboxInfoHandler(
            SessionRepository sessionRepository,
            WorkerInstanceManager instanceProvider,
            UserBudgetRepository userBudgetRepository,
            Clock clock) {
        this.sessionRepository = sessionRepository
        this.instanceProvider = instanceProvider
        this.clock = clock
        this.userBudgetRepository = userBudgetRepository
    }

    SandboxInfo execute(LoadSandboxInfo query) {
        def info = new SandboxInfo()
        def sessions = sessionRepository.findWithStatus(query.username, [STARTING, ACTIVE])
        sessions.findAll { it.status == ACTIVE }.each {
            info.activeSessions.add(it)
        }
        sessions.findAll { it.status == STARTING }.each {
            info.startingSessions.add(it)
        }
        info.instanceTypes = instanceProvider.instanceTypes

        def firstOfMonth = firstOfMonth(clock.now())
        def hoursPerInstanceType = sessionRepository.hoursByInstanceType(query.username, firstOfMonth)
        info.monthlyInstanceSpending = instanceProvider.instanceTypes.sum {
            def hours = hoursPerInstanceType[it.id] ?: 0d
            return hours * it.hourlyCost
        } as double
        def budget = userBudgetRepository.byUsername(query.username)
        info.monthlyInstanceBudget = budget.monthlyInstance
        return info
    }

    private Date firstOfMonth(Date date) {
        def zone = ZoneId.systemDefault()
        def local = date.toInstant().atZone(zone).withDayOfMonth(1).toLocalDate().atStartOfDay(zone).toInstant()
        return Date.from(local)
    }
}

class SandboxInfo {
    List<SandboxSession> activeSessions = []
    List<SandboxSession> startingSessions = []
    List<WorkerInstanceType> instanceTypes
    double monthlyInstanceBudget
    double monthlyInstanceSpending
}