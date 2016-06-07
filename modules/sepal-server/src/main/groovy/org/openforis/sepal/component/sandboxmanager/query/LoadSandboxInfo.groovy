package org.openforis.sepal.component.sandboxmanager.query

import groovy.transform.ToString
import org.openforis.sepal.component.sandboxmanager.ResourceUsageService
import org.openforis.sepal.component.sandboxmanager.SandboxSession
import org.openforis.sepal.component.sandboxmanager.SessionRepository
import org.openforis.sepal.component.sandboxmanager.UserBudgetRepository
import org.openforis.sepal.hostingservice.WorkerInstanceManager
import org.openforis.sepal.hostingservice.WorkerInstanceType
import org.openforis.sepal.query.Query
import org.openforis.sepal.query.QueryHandler
import org.openforis.sepal.user.UserRepository

import static groovymvc.validate.Constraints.custom
import static org.openforis.sepal.component.sandboxmanager.SessionStatus.*

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
    private final ResourceUsageService resourceUsageService


    LoadSandboxInfoHandler(
            SessionRepository sessionRepository,
            WorkerInstanceManager instanceProvider,
            UserBudgetRepository userBudgetRepository,
            ResourceUsageService resourceUsageService) {
        this.sessionRepository = sessionRepository
        this.instanceProvider = instanceProvider
        this.userBudgetRepository = userBudgetRepository
        this.resourceUsageService = resourceUsageService
    }

    SandboxInfo execute(LoadSandboxInfo query) {
        def info = new SandboxInfo()
        def sessions = sessionRepository.findWithStatus(query.username, [STARTING, ACTIVE])
        sessions.findAll { it.status == ACTIVE }.each {
            info.activeSessions.add(it)
        }
        sessions.findAll { it.status == STARTING || it.status == PENDING }.each {
            info.startingSessions.add(it)
        }
        info.instanceTypes = instanceProvider.instanceTypes
        info.monthlyInstanceSpending = resourceUsageService.monthlyInstanceSpending(query.username, info.instanceTypes)
        def budget = userBudgetRepository.byUsername(query.username)
        info.monthlyInstanceBudget = budget.monthlyInstance
        info.storageQuota = budget.storageQuota
        info.storageUsed = resourceUsageService.storageUsed(query.username)
        info.monthlyStorageSpending = resourceUsageService.monthlyStorageSpending(query.username)
        info.monthlyStorageBudget = budget.monthlyStorage
        return info
    }
}

class SandboxInfo {
    List<SandboxSession> activeSessions = []
    List<SandboxSession> startingSessions = []
    List<WorkerInstanceType> instanceTypes
    double monthlyInstanceBudget
    double monthlyInstanceSpending
    double monthlyStorageBudget
    double monthlyStorageSpending
    double storageQuota
    double storageUsed
}