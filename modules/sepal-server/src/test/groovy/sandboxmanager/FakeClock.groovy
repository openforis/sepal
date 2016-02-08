package sandboxmanager

import org.openforis.sepal.util.Clock
import org.openforis.sepal.util.SystemClock

import java.util.concurrent.TimeUnit

class FakeClock implements Clock {
    def systemClock = new SystemClock()
    private Date currentDate

    Date now() {
        return currentDate ?: systemClock.now()
    }


    Date set(String date) {
        currentDate = Date.parse('yyyy-MM-dd', date)
    }


    Date set(String date, String time) {
        currentDate = Date.parse('yyyy-MM-dd HH:mm:ss', "$date $time")
    }

    Date forward(int time, TimeUnit timeUnit) {
        currentDate = new Date(currentDate.time + timeUnit.toMillis(time))
    }
}
