package org.openforis.sepal.component.user.internal


import org.openforis.sepal.event.Topic

class TopicPublishingUserChangeListener implements UserChangeListener {
    private final Topic topic

    TopicPublishingUserChangeListener(Topic topic) {
        this.topic = topic
    }

    void changed(String username, Map user) {
        topic.publish(user, 'UserUpdated')
    }

    void locked(String username, Map user) {
        topic.publish(user, 'UserLocked')
    }

    void close() {
        topic.close()
    }
}
