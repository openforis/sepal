package org.openforis.sepal.component.workerinstance.command

import groovy.transform.Canonical
import groovy.transform.EqualsAndHashCode
import groovyx.net.http.HttpResponseException
import org.openforis.sepal.command.AbstractCommand
import org.openforis.sepal.command.CommandHandler
import org.openforis.sepal.component.workerinstance.api.InstanceProvisioner
import org.openforis.sepal.component.workerinstance.api.WorkerInstance
import org.openforis.sepal.component.workerinstance.event.FailedToProvisionInstance
import org.openforis.sepal.component.workerinstance.event.InstanceProvisioned
import org.openforis.sepal.event.EventDispatcher
import org.slf4j.Logger
import org.slf4j.LoggerFactory

@EqualsAndHashCode(callSuper = true)
@Canonical
class ProvisionInstance extends AbstractCommand<Void> {
    WorkerInstance instance
}

class ProvisionInstanceHandler implements CommandHandler<Void, ProvisionInstance> {
    private static final Logger LOG = LoggerFactory.getLogger(this)
    private final InstanceProvisioner instanceProvisioner
    private final EventDispatcher eventDispatcher

    ProvisionInstanceHandler(InstanceProvisioner instanceProvisioner, EventDispatcher eventDispatcher) {
        this.instanceProvisioner = instanceProvisioner
        this.eventDispatcher = eventDispatcher
    }

    Void execute(ProvisionInstance command) {
        try {
            retry(10) {
                instanceProvisioner.provisionInstance(command.instance)
            }
            eventDispatcher.publish(new InstanceProvisioned(command.instance))
        } catch (HttpResponseException e) {
            def message = (e?.response?.data ?: e.toString()) as String
            eventDispatcher.publish(new FailedToProvisionInstance(command.instance, message as String))
            throw new RuntimeException(message, e)
        } catch (Exception e) {
            eventDispatcher.publish(new FailedToProvisionInstance(command.instance, e.toString()))
            throw e
        }
        return null
    }


    private void retry(int tries, Closure<Void> operation) {
        for (int retries = 0; retries - 1 < tries; retries++) {
            try {
                operation()
                return
            } catch (Exception e) {
                if (retries - 1 < tries) {
                    backoff(retries)
                    LOG.warn("Retry #${retries + 1} after exception: ${e}")
                } else
                    throw e
            }
        }
    }

    private void backoff(int retries) {
        def millis = (long) Math.pow(2, retries ?: 0) * 1000
        Thread.sleep(millis)
    }

}
