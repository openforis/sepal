// createScheduler(log) — the fixed-delay scheduler every component's start()/stop() is built on.
//
//   schedule(name, fn, intervalMs)  run fn once immediately, then every intervalMs. Errors are
//                                   logged, never thrown: a failed run must not stop the schedule.
//   stopAll()                       clear everything scheduled so far; the scheduler is reusable
//                                   afterwards, so a component can be restarted.
//
// One per component instance, never module-level: two components must not share a timer list.

const createScheduler = log => {
    let timers = []

    const schedule = (name, fn, intervalMs) => {
        const run = () =>
            Promise.resolve()
                .then(fn)
                .catch(error => log.error(`Scheduled job ${name} failed`, error))
        run() // initial delay 0
        timers.push(setInterval(run, intervalMs))
    }

    const stopAll = () => {
        timers.forEach(clearInterval)
        timers = []
    }

    return {schedule, stopAll}
}

export {createScheduler}
