package org.openforis.sepal.sandbox

import groovymvc.Controller
import org.openforis.sepal.command.CommandDispatcher
import org.openforis.sepal.endpoint.InvalidRequest
import org.openforis.sepal.endpoint.SepalEndpoint

import static groovy.json.JsonOutput.toJson

class SandboxManagerEndpoint extends SepalEndpoint{

    SandboxManagerEndpoint(CommandDispatcher commandDispatcher) {
        super(commandDispatcher)
    }

    @Override
    void registerWith(Controller controller) {
        controller.with {

            get('sandbox/{user}') {
                response.contentType = "application/json"
                def command = new ObtainUserSandboxCommand(params.user as String)
                def errors = validate(command)
                if (errors)
                    throw new InvalidRequest(errors)
                def commandResult = commandDispatcher.submit(command)
                send(toJson(commandResult))
            }

            post('container/{id}/alive') {
                response.status = 204
                commandDispatcher.submit(new ContainerAliveCommand(params.id as int))
            }
        }
    }
}
