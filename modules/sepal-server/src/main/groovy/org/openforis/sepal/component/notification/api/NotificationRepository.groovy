package org.openforis.sepal.component.notification.api

interface NotificationRepository {

    void updateNotification(String username, String messageId, Notification.State state)

    List<Notification> listNotifications(String username)

}
