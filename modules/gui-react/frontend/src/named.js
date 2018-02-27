const nameKey = '__$$name'

export const named = (name, object) => {
    object[nameKey] = name
    return object
}

export const name = (object) => nameKey in object ? object[nameKey] : undefined