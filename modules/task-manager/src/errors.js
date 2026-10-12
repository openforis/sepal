export class Unauthorized extends Error {
    name = 'Unauthorized'
}

export class InvalidCommand extends Error {
    name = 'InvalidCommand'
}

export class NotFound extends Error {
    name = 'NotFound'
}
