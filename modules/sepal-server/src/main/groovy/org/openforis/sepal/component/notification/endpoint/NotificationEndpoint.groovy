package org.openforis.sepal.component.notification.endpoint


import groovymvc.Controller
import org.openforis.sepal.component.Component
import org.openforis.sepal.component.notification.api.Message
import org.openforis.sepal.component.notification.api.NotFound
import org.openforis.sepal.component.notification.api.Notification
import org.openforis.sepal.component.notification.command.RemoveMessage
import org.openforis.sepal.component.notification.command.SaveMessage
import org.openforis.sepal.component.notification.command.UpdateNotification
import org.openforis.sepal.component.notification.query.ListMessages
import org.openforis.sepal.component.notification.query.ListNotifications
import org.openforis.sepal.component.notification.query.LoadMessage
import org.openforis.sepal.query.QueryFailed
import org.openforis.sepal.security.Roles
import org.openforis.sepal.util.DateTime

import static groovy.json.JsonOutput.toJson

class NotificationEndpoint {

    private final Component component

    NotificationEndpoint(Component component) {
        this.component = component
    }

    void registerWith(Controller controller) {
        controller.with {

            get('/notification/messages', [Roles.ADMIN]) {
                def messages = component.submit(new ListMessages())
                def json = toJson(messages.collect { toMap(it) })
                send(json)
            }

            get('/notification/messages/{id}', [Roles.ADMIN]) {
                try {
                    def message = component.submit(new LoadMessage(params.required('id', String)))
                    def json = toJson(message.collect { toMap(it) })
                    send(json)
                } catch (QueryFailed e) {
                    if (e.cause instanceof NotFound)
                        return halt(404)
                    else
                        return halt(500)
                }
            }

            post('/notification/messages/{id}', [Roles.ADMIN]) {
                component.submit(new SaveMessage(
                        username: currentUser.username,
                        message: new Message(
                                id: params.required('id', String),
                                username: currentUser.username,
                                subject: params.required('subject', String),
                                contents: params.required('contents', String),
                                type: params.required('type', String) as Message.Type
                        )))
                response.status = 204
            }

            delete('/notification/messages/{id}', [Roles.ADMIN]) {
                component.submit(new RemoveMessage(params.required('id', String)))
                response.status = 204
            }

            get('/notification/notifications') {
                def notifications = component.submit(new ListNotifications(username: currentUser.username))
                def json = toJson(notifications.collect { toMap(it) })
                send(json)
            }

            post('/notification/notifications/{id}') {
                component.submit(new UpdateNotification(
                        username: currentUser.username,
                        messageId: params.required('id', String),
                        state: params.required('state', String) as Notification.State
                ))
                response.status = 204
            }

        }
    }

    Map toMap(Message message) {
        message.with {
            return [
                    id          : id,
                    username    : username,
                    subject     : subject,
                    contents    : contents,
                    type        : type.name(),
                    creationTime: DateTime.toUtcString(creationTime),
                    updateTime  : DateTime.toUtcString(updateTime)
            ]
        }
    }

    Map toMap(Notification notification) {
        notification.with {
            return [
                    message : message,
                    username: username,
                    state   : state.name()
            ]
        }
    }

}
