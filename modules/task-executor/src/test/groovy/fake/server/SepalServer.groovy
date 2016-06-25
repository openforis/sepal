package fake.server

import groovymvc.Controller
import groovymvc.RequestContext

class SepalServer extends TestServer {
    private static Closure taskCallback
    private static Closure tasksCallback

    // TODO: Task executor username/password

    void register(Controller controller) {
        controller.with {
            post('/tasks/task/{id}/state-updated') {
                if (!taskCallback)
                    return
                def clone = taskCallback.clone() as Closure
                clone.delegate = requestContext
                clone.call(requestContext)
            }

            post('/tasks/active') {
                if (!tasksCallback)
                    return
                def clone = tasksCallback?.clone() as Closure
                clone.delegate = requestContext
                clone.call(requestContext)
            }
        }
    }

    void onTaskProgress(@DelegatesTo(RequestContext) Closure callback) {
        taskCallback = callback
    }

    void onTasksProgress(@DelegatesTo(RequestContext) Closure callback) {
        tasksCallback = callback
    }
}
