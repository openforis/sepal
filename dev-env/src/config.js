import {readFileSync} from 'fs'

export const SEPAL_SRC = '/home/sepal/sepal'
export const ENV_FILE = '/etc/sepal/config/env'

export const NAME_COLUMN = 0
export const STATUS_COLUMN = 30
export const DEPS_COLUMN = 100

export const GROUP_PREFIX = ':'

export const deps = JSON.parse(readFileSync('../config/deps.json', 'utf-8'))
export const groups = JSON.parse(readFileSync('../config/groups.json', 'utf-8'))

export const USER_UID = process.env.USER_UID
export const USER_GID = process.env.USER_GID
