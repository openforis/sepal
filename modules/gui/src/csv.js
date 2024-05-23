import Papa from 'papaparse'
import {forkJoin, Subject, toArray} from 'rxjs'

export const parseCsvFile$ = file => {
    const row$ = new Subject()
    const columns$ = new Subject()
    let first = true
    Papa.parse(file, {
        worker: true,
        header: true,
        dynamicTyping: true,
        skipEmptyLines: 'greedy',
        step: ({data, meta: {fields}}) => {
            row$.next(data)
            if (first) {
                columns$.next(fields)
                columns$.complete()
                first = false
            }
        },
        complete: () => row$.complete()
    })
    return forkJoin({
        rows: row$.pipe(toArray()),
        columns: columns$
    })
}
