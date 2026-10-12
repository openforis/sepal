import {dirname} from 'node:path'
import {fileURLToPath} from 'node:url'

const fileName = importMetaUrl => fileURLToPath(importMetaUrl)

const dirName = importMetaUrl => dirname(fileName(importMetaUrl))

export {dirName, fileName}
