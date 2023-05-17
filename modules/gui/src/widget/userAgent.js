import {select} from 'store'

export const isMobile = () => {
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

export const isHighDensityDisplay = () =>
    (window.matchMedia
        && (window.matchMedia('only screen and (min-resolution: 124dpi), only screen and (min-resolution: 1.3dppx), only screen and (min-resolution: 48.8dpcm)').matches || window.matchMedia('only screen and (-webkit-min-device-pixel-ratio: 1.3), only screen and (-o-min-device-pixel-ratio: 2.6/2), only screen and (min--moz-device-pixel-ratio: 1.3), only screen and (min-device-pixel-ratio: 1.3)').matches)
    ) || (window.devicePixelRatio && window.devicePixelRatio > 1.3)

export const isRetinaDisplay = () =>
    (window.matchMedia
        && (window.matchMedia('only screen and (min-resolution: 192dpi), only screen and (min-resolution: 2dppx), only screen and (min-resolution: 75.6dpcm)').matches || window.matchMedia('only screen and (-webkit-min-device-pixel-ratio: 2), only screen and (-o-min-device-pixel-ratio: 2/1), only screen and (min--moz-device-pixel-ratio: 2), only screen and (min-device-pixel-ratio: 2)').matches)
    ) || (window.devicePixelRatio && window.devicePixelRatio >= 2) && /(iPad|iPhone|iPod)/g.test(navigator.userAgent)

export const isChromiumBasedBrowser = () =>
    !!window.chrome
