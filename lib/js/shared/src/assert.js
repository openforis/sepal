export const assert = (arg, validator, msg, required = false) => {
    const valid = required
        // ? !_.isNil(arg) && validator(arg)
        ? arg !== undefined && arg !== null && validator(arg)
        : arg === undefined || arg === null || validator(arg)
    if (!valid) {
        throw new Error([
            msg,
            required ? '(required)' : ''
        ].join(' '))
    }
}
