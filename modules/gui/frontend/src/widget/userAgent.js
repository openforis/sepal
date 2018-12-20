import {select} from 'store'

export const autoFocusEnabled = () => {
    const dimensions = select('dimensions')
    return dimensions.width > 500 && dimensions.height > 500
}
