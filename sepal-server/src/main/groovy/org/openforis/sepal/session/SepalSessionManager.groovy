package org.openforis.sepal.session

import org.openforis.sepal.instance.Instance
import org.openforis.sepal.instance.InstanceManager
import org.openforis.sepal.instance.InstanceType
import org.openforis.sepal.session.model.SepalSession
import org.openforis.sepal.session.model.UserSessions
import org.openforis.sepal.user.UserRepository
import org.openforis.sepal.util.DateTime
import org.slf4j.Logger
import org.slf4j.LoggerFactory

import java.util.concurrent.Executors
import java.util.concurrent.ScheduledExecutorService
import java.util.concurrent.TimeUnit

import static org.openforis.sepal.instance.Instance.Status.AVAILABLE
import static org.openforis.sepal.session.model.SessionStatus.ALIVE
import static org.openforis.sepal.session.model.SessionStatus.REQUESTED

interface SepalSessionManager {

    void aliveSignal( int sessionId )

    void start( int containerInactiveTimeout, int checkInterval)

    void stop()

    UserSessions getUserSessions( String username )

    SepalSession bindToUserSession (String username, Long sessionId)

    SepalSession generateNewSession ( String username, Long containerInstanceType )


}


class ConcreteSepalSessionManager implements SepalSessionManager{

    private final static Logger LOG = LoggerFactory.getLogger(this)

    private final SessionContainerProvider sandboxProvider
    private final SepalSessionRepository dataRepository
    private final UserRepository userRepo
    private final InstanceManager instanceManager

    private final ScheduledExecutorService executor = Executors.newSingleThreadScheduledExecutor()

    ConcreteSepalSessionManager(SessionContainerProvider sandboxProvider, SepalSessionRepository dataRepository, UserRepository userRepo, InstanceManager instanceManager){
        this.sandboxProvider = sandboxProvider
        this.dataRepository = dataRepository
        this.userRepo = userRepo
        this.instanceManager = instanceManager
    }

    @Override
    SepalSession bindToUserSession(String username, Long sessionId) {
        userRepo.fetchUser(username)
        def session = dataRepository.fetchUserSession(username,sessionId)
        def instance
        try{
            instance = instanceManager.gatherFacts(session.instance)
        }catch (InvalidInstance invalid){
            throw new InvalidSession("Session container instance not valid",invalid)
        }

        if (instance.status == AVAILABLE){
            if (session.status == REQUESTED){
                createContainer(username,session,instance)
                session = dataRepository.fetchUserSession(username,sessionId)
            }else{
                if (!sandboxProvider.isRunning(session)){
                    throw new InvalidSession("Session container $session.containerId not running anymore")
                }
            }
        }
        return session
    }

    @Override
    SepalSession generateNewSession(String username, Long containerInstanceType) {
        def session
        userRepo.fetchUser(username)
        def instance = instanceManager.reserveInstance(username,containerInstanceType)
        session = new SepalSession(username: username, instance: instance, status: REQUESTED, createdOn: new Date())
        session.sessionId = dataRepository.requested(username, instance.id)
        createContainer(username,session,instance)
        if (instance?.status == AVAILABLE){
            createContainer(username,session,instance)
        }
        session = dataRepository.fetchUserSession(username,session.sessionId)

        return session
    }

    @Override
    UserSessions getUserSessions(String username) {
      new UserSessions(
                monthlyCostsReport: dataRepository.getMonthlyCostsReport(username),
                user: userRepo.fetchUser(username),
                activeSessions: fetchActiveSessions(username),
                availableInstanceTypes: fetchAvailableInstanceTypes(username)
        )
    }

    private void createContainer(String username,SepalSession session, Instance instance){
        try{
            def sessionData = sandboxProvider.obtain(username,instance)
            dataRepository.created(session.sessionId,sessionData.containerId,sessionData.containerURI)
        }catch (Exception ex){
            LOG.error("Error during container creation.",ex)
            instanceManager.releaseInstance(username, instance.id)
            dataRepository.terminated(session.sessionId)
            throw ex
        }
    }

    private List<SepalSession> fetchActiveSessions(String username){
        def sessions = dataRepository.getSessions(username,REQUESTED,ALIVE)
        sessions?.each{ SepalSession session ->
            session.requestUrl = "/sandbox/$username/session/$session.sessionId"
        }
        return sessions
    }

    private List<InstanceType> fetchAvailableInstanceTypes ( String username) {
        def instances = instanceManager.availableInstanceTypes
        instances?.each { InstanceType type ->
            type.requestUrl = "/sandbox/$username/container/$type.id/"

        }
        return instances
    }

    @Override
    void aliveSignal(int sessionId) {
        LOG.debug("Alive signal received from session $sessionId")
        dataRepository.alive(sessionId)
    }

    void stop(){ executor.shutdown()  }

    @Override
    void start( int containerInactiveTimeout, int checkInterval) {
        executor.scheduleWithFixedDelay(
            new SandboxDaemonChecker( sandboxProvider, dataRepository,instanceManager,containerInactiveTimeout),
            0L,checkInterval, TimeUnit.SECONDS
        )
     }


    // @ TODO Run tasks to catch up running instances
    private class SandboxDaemonChecker implements Runnable{

        private final SepalSessionRepository dataRepository
        private final SessionContainerProvider containersProvider
        private final int containerInactiveTimeout
        private final InstanceManager instanceManager

        SandboxDaemonChecker(SessionContainerProvider containersProvider,
                             SepalSessionRepository dataRepository, InstanceManager instanceManager, int containerInactiveTimeout ){
            this.dataRepository = dataRepository
            this.containerInactiveTimeout = containerInactiveTimeout
            this.containersProvider = containersProvider
            this.instanceManager = instanceManager
        }

        @Override
        void run() {
            def aliveSessions = dataRepository.getSessions(ALIVE)
            aliveSessions?.each { SepalSession session ->
                doCheck(session)
            }
        }

        void doCheck(SepalSession session){
            try{
                Date containerExpireDate = DateTime.add(session.statusRefreshedOn,Calendar.SECOND,containerInactiveTimeout)
                if (new Date().after(containerExpireDate)){
                    LOG.info(" Container $session.containerId marked as to be terminated. Inactive Ttl($containerInactiveTimeout seconds) reached")
                    if (instanceManager.gatherFacts(session.instance)){
                        LOG.debug("Container instance $session.instance.id still running. Going to physically terminated the container ")
                        containersProvider.release(session)
                    }else {
                        LOG.warn("Instance $session.instance.id not running anymore.")
                    }
                    dataRepository.terminated(session.sessionId)
                }
            } catch (Exception ex) {
                LOG.error(" Error while checking sandbox $session.sessionId",ex)
            }
        }
    }

}
