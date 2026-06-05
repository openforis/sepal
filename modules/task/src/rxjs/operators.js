import {pipe, map} from 'rxjs'

export const progress = ({defaultMessage, messageKey, messageArgs}) =>
        pipe(
            map(() => ({defaultMessage, messageKey, messageArgs}))
        )
