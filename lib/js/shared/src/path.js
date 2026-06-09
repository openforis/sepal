import {dirname} from 'path'
import {fileURLToPath} from 'url'

const fileName = importMetaUrl => fileURLToPath(importMetaUrl)

const dirName = importMetaUrl => dirname(fileName(importMetaUrl))

export {dirName, fileName}
