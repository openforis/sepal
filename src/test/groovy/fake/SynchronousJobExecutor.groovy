package fake

import org.openforis.sepal.util.JobExecutor

class SynchronousJobExecutor implements JobExecutor {
    
    void execute(Closure job) {
        job()
    }

    @Override
    void executeAllAndWait(Collection<Closure> jobs) {
        jobs.each {it()}
    }

    @Override
    public void stop() {
        
    }
}
