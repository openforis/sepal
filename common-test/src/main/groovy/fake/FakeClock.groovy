package fake

import org.openforis.sepal.util.Clock
import org.openforis.sepal.util.SystemClock

import java.text.SimpleDateFormat
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
        currentTime = new SimpleDateFormat('yyyy-MM-dd').parse(date)
    }


    Date set(String date, String time) {
        currentTime = new SimpleDateFormat('yyyy-MM-dd HH:mm:ss').parse("$date $time")
    }

    Date forward(long time, TimeUnit timeUnit) {
        if (!currentTime)
            set()
        currentTime = new Date(currentTime.time + timeUnit.toMillis(time))
    }
}
