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

            get('sandbox/{user}?type={instanceType}') {
                response.contentType = "application/json"
                def command = new ObtainUserSandboxCommand(params.user as String, params.instanceType as Integer)
                def errors = validate(command)
                if (errors)
                    throw new InvalidRequest(errors)
                def commandResult = commandDispatcher.submit(command)
                switch (commandResult.instance.status){

                    case AVAILABLE:
                        send(toJson(commandResult))
                        break;
                    default:
                        response.status = 202
                }
            }

            post('container/{id}/alive') {
                response.status = 204
                commandDispatcher.submit(new ContainerAliveCommand(params.id as int))
            }
        }
    }
}
