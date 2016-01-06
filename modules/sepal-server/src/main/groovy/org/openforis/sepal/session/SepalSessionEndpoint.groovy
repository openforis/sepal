package org.openforis.sepal.session

import groovymvc.Controller
import org.openforis.sepal.command.CommandDispatcher
import org.openforis.sepal.endpoint.InvalidRequest
import org.openforis.sepal.endpoint.SepalEndpoint
import org.openforis.sepal.session.command.BindToUserSessionCommand
import org.openforis.sepal.session.command.GetUserSessionsCommand
import org.openforis.sepal.session.command.ObtainUserSessionCommand
import org.openforis.sepal.session.command.SessionAliveCommand

import static groovy.json.JsonOutput.toJson
import static org.openforis.sepal.session.model.SessionStatus.*

class SepalSessionEndpoint extends SepalEndpoint {

    SepalSessionEndpoint(CommandDispatcher commandDispatcher) {
        super(commandDispatcher)
    }

    @Override
    void registerWith(Controller controller) {
        controller.with {

            get('sandbox/{user}') {
                response.contentType = "application/json"
                def command = new GetUserSessionsCommand(username: params.user as String)
                def errors = validate(command)
                if (errors) {
                    throw new InvalidRequest(errors)
                }
                def commandResult = commandDispatcher.submit(command)
                send(toJson(commandResult))
            }

            get('sandbox/{user}/session/{sessionId}') {
                response.contentType = 'application/json'
                def command = new BindToUserSessionCommand(username: params.user as String, sessionId: params.sessionId as Long)
                def errors = validate(command)
                if (errors) {
                    throw new InvalidRequest(errors)
                }
                def commandResult = commandDispatcher.submit(command)
                send(toJson(commandResult))
            }

            post('sandbox/{user}/container/{instanceType}') {
                response.contentType = "application/json"

                def command = new ObtainUserSessionCommand(params.user as String, params.instanceType as Long)
                def errors = validate(command)
                if (errors)
                    throw new InvalidRequest(errors)
                def commandResult = commandDispatcher.submit(command)
                def status = 200
                switch (commandResult?.status) {

                    case ALIVE:
                        send(toJson(commandResult))
                        break
                    case REQUESTED:
                        status = 202
                        break
                    case TERMINATED:
                    default:
                        status = 500
                        break
                }
                response.status = status

            }

            post('container/{id}/alive') {
                response.status = 204
                commandDispatcher.submit(new SessionAliveCommand(params.id as int))
            }
        }
    }
}
