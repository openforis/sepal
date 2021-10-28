import {select} from 'store'

const _isMobile = () => {
    const userAgent = navigator.userAgent || navigator.vendor || window.opera
    if (/windows phone/i.test(userAgent))
        return true

    if (/android/i.test(userAgent))
        return true

    if (/iPad|iPhone|iPod/.test(userAgent) && !window.MSStream)
        return true

    const dimensions = select('dimensions')
    return dimensions.width < 500 || (dimensions.height < 500 && dimensions.height > 0)
}

const IS_MOBILE = _isMobile()

export const isMobile = () => IS_MOBILE
