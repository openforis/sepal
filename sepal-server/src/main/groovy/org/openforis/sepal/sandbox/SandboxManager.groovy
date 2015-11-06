package org.openforis.sepal.sandbox

import org.openforis.sepal.user.NonExistingUser
import org.openforis.sepal.user.UserRepository
import org.openforis.sepal.util.DateTime
import org.slf4j.Logger
import org.slf4j.LoggerFactory

import java.util.concurrent.Executors
import java.util.concurrent.ScheduledExecutorService
import java.util.concurrent.TimeUnit

import static org.openforis.sepal.sandbox.SandboxStatus.ALIVE

interface SandboxManager {

    SandboxData getUserSandbox ( String username )

    void aliveSignal( int sandboxId )

    void start( int containerInactiveTimeout, int checkInterval)

    void stop()

}

class ConcreteSandboxManager implements SandboxManager{

    private final static Logger LOG = LoggerFactory.getLogger(this)

    private final SandboxContainersProvider sandboxProvider
    private final SandboxDataRepository dataRepository
    private final UserRepository userRepo

    private final ScheduledExecutorService executor = Executors.newSingleThreadScheduledExecutor()

    ConcreteSandboxManager( SandboxContainersProvider sandboxProvider, SandboxDataRepository dataRepository, UserRepository userRepo){
        this.sandboxProvider = sandboxProvider
        this.dataRepository = dataRepository
        this.userRepo = userRepo

    }

    @Override
    SandboxData getUserSandbox(String username) {
        def runningSandbox = null
        try{
            if (! (userRepo.userExist(username))){
                throw new NonExistingUser(username)
            }
            runningSandbox = dataRepository.getUserRunningSandbox(username)
            if (runningSandbox){
                LOG.debug("Found data about running sandbox($runningSandbox.containerId) for user $username")
                def running = sandboxProvider.isRunning(runningSandbox.containerId)
                if (!running){
                    LOG.info("Stale sandbox data found for $username")
                    dataRepository.terminated(runningSandbox.sandboxId)
                    runningSandbox = askContainer(username)
                }
            }else{
                runningSandbox = askContainer(username)
            }
        }catch (Exception ex){
            LOG.error("Error while getting the user sandbox",ex)
            throw ex
        }

        return runningSandbox
    }

    private SandboxData askContainer(String username){
        def data = sandboxProvider.obtain(username)
        try{
            data.sandboxId = dataRepository.created(username,data.containerId,data.uri)
        }catch (Exception ex){
            LOG.error("Error while storing sandbox data to the database. Creation will be rollbacked",ex)
            sandboxProvider.release(data.containerId)
        }
        return data
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
            new SandboxManagerUnusedContainerChecker( sandboxProvider, dataRepository, containerInactiveTimeout),
            0L,checkInterval, TimeUnit.SECONDS
        )
     }


    private class SandboxManagerUnusedContainerChecker implements Runnable{

        SandboxDataRepository dataRepository
        SandboxContainersProvider containersProvider
        int containerInactiveTimeout

        SandboxManagerUnusedContainerChecker( SandboxContainersProvider containersProvider,
                                              SandboxDataRepository dataRepository, int containerInactiveTimeout ){
            this.dataRepository = dataRepository
            this.containerInactiveTimeout = containerInactiveTimeout
            this.containersProvider = containersProvider
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
                    containersProvider.release(sandbox.containerId)
                    dataRepository.terminated(sandbox.sandboxId)
                }
            } catch (Exception ex) {
                LOG.error(" Error while checking sandbox $sandbox.sandboxId",ex)
            }
        }
    }

}
