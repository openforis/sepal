package org.openforis.sepal.taskexecutor.util

import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean

interface Scheduler {
    void schedule(Closure callback)

    void cancel()

}

class SleepingScheduler implements Scheduler {
    private final int rate
    private final TimeUnit timeUnit

    private threads = new ConcurrentHashMap<Thread, Boolean>()
    private AtomicBoolean stopped = new AtomicBoolean()

    SleepingScheduler(int rate, TimeUnit timeUnit) {
        this.rate = rate
        this.timeUnit = timeUnit
    }

    void schedule(Closure callback) {
        if (stopped.get())
            return
        def thread = Thread.currentThread()
        try {
            threads.put(thread, true)
            while (!stopped.get() && !Thread.interrupted()) {
                def result = callback()
                if (!result)
                    return
                Thread.sleep(timeUnit.toMillis(rate))
            }
        } catch (InterruptedException ignore) {
            thread.interrupt()
        } finally {
            threads.remove(thread)
        }
    }

    void cancel() {
        stopped.set(true)
        threads.keySet()*.interrupt()
        threads.clear()
    }
}