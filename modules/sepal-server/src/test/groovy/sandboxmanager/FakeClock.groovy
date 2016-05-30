package sandboxmanager

import org.openforis.sepal.util.Clock
import org.openforis.sepal.util.SystemClock

import java.time.temporal.TemporalUnit
import java.util.concurrent.TimeUnit

class FakeClock implements Clock {
    def systemClock = new SystemClock()
    private Date currentTime

    Date now() {
        return currentTime ?: systemClock.now()
    }

    Date set() {
        currentTime = new Date()
    }

    Date set(Date date) {
        currentTime = date
    }

    Date set(String date) {
        currentTime = Date.parse('yyyy-MM-dd', date)
    }


    Date set(String date, String time) {
        currentTime = Date.parse('yyyy-MM-dd HH:mm:ss', "$date $time")
    }

    Date advance(long amount, TemporalUnit timeUnit) {
        if (!currentTime)
            set()
        def next = currentTime.toInstant().plus(amount, timeUnit)
        currentTime = Date.from(next)
    }

    Date forward(int time, TimeUnit timeUnit) {
        if (!currentTime)
            set()
        currentTime = new Date(currentTime.time + timeUnit.toMillis(time))
    }
}
