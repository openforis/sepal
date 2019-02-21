export const download = (url, filename) => {
    // create hidden anchor, attach to DOM, click it and remove it from the DOM
    var downloadElement = document.createElement('a')
    downloadElement.setAttribute('style', 'display: none')
    downloadElement.setAttribute('href', url)
    downloadElement.setAttribute('download', filename)
    document.body.appendChild(downloadElement)
    downloadElement.click()
    downloadElement.remove()
}

export const downloadObject = (object, filename) => {
    const data = window.URL.createObjectURL(object)
    download(data, filename)
    window.URL.revokeObjectURL(data)
}
