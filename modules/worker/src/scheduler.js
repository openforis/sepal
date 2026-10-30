// createScheduler(log) — the fixed-delay scheduler every component's start()/stop() is built on.
//
//   schedule(name, fn, delayMs)  run fn once immediately, then again delayMs after each run
//                                completes, so runs of a job never overlap: overlapping sweeps act
//                                on each other's stale reads. Errors are logged, never thrown: a
//                                failed run must not stop the schedule.
//   stopAll()                    stop everything scheduled so far, including a job whose run is
//                                still in flight; the scheduler is reusable afterwards, so a
//                                component can be restarted.
//
// One per component instance, never module-level: two components must not share a job list.

const createScheduler = log => {
    let jobs = []

    const schedule = (name, fn, delayMs) => {
        const job = {timer: null, stopped: false}
        const run = () =>
            Promise.resolve()
                .then(fn)
                .catch(error => log.error(`Scheduled job ${name} failed`, error))
                .then(() => {
                    if (!job.stopped) {
                        job.timer = setTimeout(run, delayMs)
                    }
                })
        jobs.push(job)
        run()
    }

    const stopAll = () => {
        jobs.forEach(job => {
            job.stopped = true
            clearTimeout(job.timer)
        })
        jobs = []
    }

    return {schedule, stopAll}
}

export {createScheduler}
