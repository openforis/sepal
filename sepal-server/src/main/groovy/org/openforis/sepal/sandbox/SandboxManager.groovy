package org.openforis.sepal.sandbox

import org.openforis.sepal.instance.Instance
import org.openforis.sepal.instance.InstanceManager
import org.openforis.sepal.user.NonExistingUser
import org.openforis.sepal.user.UserRepository
import org.openforis.sepal.util.DateTime
import org.slf4j.Logger
import org.slf4j.LoggerFactory

import java.util.concurrent.Executors
import java.util.concurrent.ScheduledExecutorService
import java.util.concurrent.TimeUnit

import static org.openforis.sepal.instance.Instance.Status.AVAILABLE
import static org.openforis.sepal.sandbox.SandboxStatus.ALIVE
import static org.openforis.sepal.sandbox.SandboxStatus.REQUESTED

interface SandboxManager {

    SandboxData getUserSandbox ( String username, Size sandboxSize )

    SandboxData getUserSandbox ( String username)

    void aliveSignal( int sandboxId )

    void start( int containerInactiveTimeout, int checkInterval)

    void stop()

}

// @ TODO Handle multithreading
class ConcreteSandboxManager implements SandboxManager{

    private final static Logger LOG = LoggerFactory.getLogger(this)

    private final SandboxContainersProvider sandboxProvider
    private final SandboxDataRepository dataRepository
    private final UserRepository userRepo
    private final InstanceManager instanceManager

    private final ScheduledExecutorService executor = Executors.newSingleThreadScheduledExecutor()

    ConcreteSandboxManager( SandboxContainersProvider sandboxProvider, SandboxDataRepository dataRepository, UserRepository userRepo, InstanceManager instanceManager){
        this.sandboxProvider = sandboxProvider
        this.dataRepository = dataRepository
        this.userRepo = userRepo
        this.instanceManager = instanceManager
    }

    private SandboxData fetchUserSandbox( String username ){
        def userSandbox
        checkUser(username)
        //@ TODO Deal with requested sandboxes on the next iteration
        userSandbox = dataRepository.getUserSandbox(username)
        if (userSandbox){
            def instanceRunning = instanceManager.gatherFacts(userSandbox.instance)
            if (!instanceRunning){
                LOG.warn("Instance($userSandbox.instance.id) associated with sandbox $userSandbox.sandboxId is not running anymore")
                dataRepository.terminated(userSandbox.sandboxId)
                userSandbox = null
            }
            def sandboxRunning = sandboxProvider.isRunning(userSandbox)
            if (!sandboxRunning && instanceRunning.status == AVAILABLE){
                 LOG.warn("Container $userSandbox.containerId is not running anymore on instance $userSandbox.instance.id")
                dataRepository.terminated(userSandbox.sandboxId)
            }
        }
        return userSandbox
    }

    private void checkUser ( String username ) {
        if (! (userRepo.userExist(username))){
            throw new NonExistingUser(username)
        }
    }

    private static void checkSandboxSize (SandboxData sandbox, Size expectedSize){
        if (! (sandbox.size == expectedSize)){
            LOG.warn("Existing sandbox size($sandbox.size.value) doesn't match the requested one($expectedSize.value)")
        }
    }


    @Override
    SandboxData getUserSandbox(String username, Size sandboxSize = Size.SMALL) {
        def runningSandbox = null
        try{
            runningSandbox = fetchUserSandbox(username)
            if (runningSandbox){
                checkSandboxSize(runningSandbox,sandboxSize)
            }else{
                runningSandbox = createContainer (username, sandboxSize)
            }
        }catch (Exception ex){
            LOG.error("Error while getting the user sandbox",ex)
            throw ex
        }

        return runningSandbox
    }

    private SandboxData createContainer ( String username, Size sandboxSize) {
        def sandbox = null
        Instance instance = instanceManager.reserveSlot(sandboxSize.value,username)
        if (!instance){
            throw new RuntimeException('Something went wrong while obtaining the instance where to istantiate the container')
        }
        def sandboxId = dataRepository.requested(username, instance.id, sandboxSize)
        try{
            switch (instance.status){
                case AVAILABLE:
                    sandbox = doObtainSandbox( username,sandboxId,instance )
                    break
                default:
                    LOG.info("Sandbox container cannot be instantiated since the host machine is not available yet ($instance.status)")
                    sandbox = new SandboxData(sandboxId: sandboxId, status: REQUESTED)
                    break
            }
        }catch (Exception ex){
            LOG.error("Error while creating the container.",ex)
            dataRepository.terminated(sandboxId)
        }
        return sandbox

    }


    private SandboxData doObtainSandbox ( String username,int sandboxRequestId, Instance instance) {
        LOG.info("Going to request a container for the sandbox $sandboxRequestId")
        def sandbox = sandboxProvider.obtain(username,instance)
        sandbox.sandboxId = sandboxRequestId
        try{
            dataRepository.created(sandbox.sandboxId,sandbox.containerId,sandbox.uri)
        }catch (Exception ex){
            LOG.warn("Error while storing container info",ex)
            sandboxProvider.release(sandbox)
            dataRepository.terminated(sandboxRequestId)
            throw ex
        }
        return sandbox
    }


    @Override
    void aliveSignal(int sandboxId) {
        LOG.debug("Alive signal received from sanbox $sandboxId container")
        dataRepository.alive(sandboxId)
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

        private final SandboxDataRepository dataRepository
        private final SandboxContainersProvider containersProvider
        private final int containerInactiveTimeout
        private final InstanceManager instanceManager

        SandboxDaemonChecker(SandboxContainersProvider containersProvider,
                             SandboxDataRepository dataRepository,InstanceManager instanceManager, int containerInactiveTimeout ){
            this.dataRepository = dataRepository
            this.containerInactiveTimeout = containerInactiveTimeout
            this.containersProvider = containersProvider
            this.instanceManager = instanceManager
        }

        @Override
        void run() {
            def aliveContainers = dataRepository.getSandboxes(ALIVE)
            aliveContainers?.each { SandboxData sandbox ->
                doCheck(sandbox)
            }
        }

        void doCheck( SandboxData sandbox){
            try{
                Date containerExpireDate = DateTime.add(sandbox.statusRefreshedOn,Calendar.SECOND,containerInactiveTimeout)
                if (new Date().after(containerExpireDate)){
                    LOG.info(" Container $sandbox.containerId marked as to be terminated. Inactive Ttl($containerInactiveTimeout seconds) reached")
                    if (instanceManager.gatherFacts(sandbox.instance)){
                        LOG.debug("Container instance $sandbox.instance.id still running. Going to physically terminated the container ")
                        containersProvider.release(sandbox)
                    }else {
                        LOG.warn("Instance $sandbox.instance.id not running anymore.")
                    }
                    dataRepository.terminated(sandbox.sandboxId)
                }
            } catch (Exception ex) {
                LOG.error(" Error while checking sandbox $sandbox.sandboxId",ex)
            }
        }
    }

}
