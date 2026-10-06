import {Subject} from 'rxjs'

export const taskChanged$ = new Subject()

export const emitTaskChanged = username =>
    taskChanged$.next({username})
