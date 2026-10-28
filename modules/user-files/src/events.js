import {Subject} from 'rxjs'

// Published as files.FilesDeleted ({username}); storage rescans the user's home on it.
export const filesDeleted$ = new Subject()
