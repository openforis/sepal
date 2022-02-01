import {readFileSync} from 'fs'

export const SEPAL_SRC = '/usr/local/src/sepal'
export const ENV_FILE = '/etc/sepal/config/env'

export const NAME_COLUMN = 0
export const STATUS_COLUMN = 30
export const DEPS_COLUMN = 60

export const GROUP_PREFIX = ':'

export const deps = JSON.parse(readFileSync('../config/deps.json', 'utf-8'))
export const groups = JSON.parse(readFileSync('../config/groups.json', 'utf-8'))
