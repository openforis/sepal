// The mounted notifications container, kept out of the Notifications widget: the BlurDetector needs it, and
// importing the widget would close an import cycle through its copy button's tooltip.
let containerElement = null

export const setNotificationsContainer = element => {
    containerElement = element
}

export const getNotificationsContainer = () =>
    containerElement
