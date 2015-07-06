package fake

import org.openforis.sepal.util.JobExecutor

import groovy.lang.Closure;

import java.util.concurrent.Callable

class SynchronousJobExecutor implements JobExecutor {
    
    void execute(Closure job) {
        job()
    }

    @Override
    public void stop() {
        
    }
}
