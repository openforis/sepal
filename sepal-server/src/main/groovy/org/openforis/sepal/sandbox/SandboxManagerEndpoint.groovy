package org.openforis.sepal.sandbox

import groovymvc.Controller
import org.openforis.sepal.command.CommandDispatcher
import org.openforis.sepal.endpoint.InvalidRequest
import org.openforis.sepal.endpoint.SepalEndpoint

import static groovy.json.JsonOutput.toJson
import static org.openforis.sepal.instance.Instance.Status.AVAILABLE

class SandboxManagerEndpoint extends SepalEndpoint {

    SandboxManagerEndpoint(CommandDispatcher commandDispatcher) {
        super(commandDispatcher)
    }

    @Override
    void registerWith(Controller controller) {
        controller.with {

            get('sandbox/{user}') {
                response.contentType = "application/json"
                def command = new ObtainUserSandboxCommand(params.user as String,1)
                def errors = validate(command)
                if (errors)
                    throw new InvalidRequest(errors)
                def commandResult = commandDispatcher.submit(command)
                def status = 200
                switch (commandResult?.instance?.status){

                    case AVAILABLE:
                        send(toJson(commandResult))
                        break
                    case null:
                        status = 500
                        break
                    default:
                        status = 202
                }
                response.status = status

            }

            post('container/{id}/alive') {
                response.status = 204
                commandDispatcher.submit(new ContainerAliveCommand(params.id as int))
            }
        }
    }
}
