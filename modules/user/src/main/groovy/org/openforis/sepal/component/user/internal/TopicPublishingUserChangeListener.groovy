package org.openforis.sepal.component.user.internal


import groovy.json.JsonOutput
import org.openforis.sepal.event.Topic

class TopicPublishingUserChangeListener implements UserChangeListener {
    private final Topic topic

    TopicPublishingUserChangeListener(Topic topic) {
        this.topic = topic
    }

    void changed(String username, Map user) {
        def userJson = user == null ? null : JsonOutput.toJson(user)
        topic.publish(user, 'UserUpdated')
    }

    void close() {
        topic.close()
    }
}
