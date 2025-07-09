import jsep from 'jsep'
import _ from 'lodash'

export const determineUsedBands = ({expression, images, calculations}) => {
    const allImages = [...images, ...calculations]

    const bandsFromNode = node => {
        switch (node.type) {
            case 'Identifier': return bandsFromIdentifier(node)
            case 'MemberExpression': return bandsFromMemberExpression(node)
            case 'BinaryExpression': return bandsFromBinaryExpression(node)
            case 'UnaryExpression': return bandsFromUnaryExpression(node)
            case 'ConditionalExpression': return bandsFromConditionalExpression(node)
            case 'CallExpression': return bandsFromCallExpression(node)
            case 'Literal': return bandsFromLiteral(node)
            default: throw Error('Invalid expression')
        }
    }

    const findImage = imageName => {
        const image = allImages.find(image => image.name === imageName)
        if (image) {
            return image
        } else {
            throw new InvalidImageName(`No image or calculation with name ${imageName}`)
        }
    }

    const toUsedBand = (image, band) =>
        ({...band, imageId: image.imageId, imageName: image.name})

    const bandsFromIdentifier = identifier => {
        if (typeof Math[identifier.name] === 'number') {
            return []
        } else {
            const imageName = identifier.name
            const image = findImage(imageName)
            return image.includedBands
                .map(band => toUsedBand(image, band))
        }
    }

    const bandsFromMemberExpression = memberExpression => {
        const imageName = memberExpression.object.name
        const bandName = memberExpression.property.name || memberExpression.property.value
        const image = findImage(imageName)
        const band = image.includedBands
            .find(band => band.name === bandName)
        if (band) {
            return [toUsedBand(image, band)]
        } else {
            throw new InvalidBandName(`No band with name ${bandName} in image ${imageName}`)
        }
    }

    const bandsFromBinaryExpression = binaryExpression => {
        return [
            ...bandsFromNode(binaryExpression.left),
            ...bandsFromNode(binaryExpression.right)
        ]
    }

    const bandsFromUnaryExpression = unaryExpression => {
        return bandsFromNode(unaryExpression.argument)
    }

    const bandsFromLiteral = literal => {
        if (typeof (literal.value) !== 'number') {
            throw new InvalidLiteral('Only numeric literal are supported')
        }
        return []
    }

    const bandsFromConditionalExpression = conditionalExpression => {
        return [
            ...bandsFromNode(conditionalExpression.test),
            ...bandsFromNode(conditionalExpression.consequent),
            ...bandsFromNode(conditionalExpression.alternate),
        ]
    }

    const bandsFromCallExpression = callExpression => {
        const functionName = callExpression.callee.name

        const mathFunction = typeof Math[functionName] === 'function'
        if (mathFunction) {
            return callExpression.arguments
                .map(bandsFromNode)
                .flat()
        } else {
            throw new InvalidCall(`Invalid function: ${functionName}`)
        }
    }

    const node = jsep.parse(expression)
    return _.uniqWith(bandsFromNode(node), _.isEqual)
}

export class InvalidImageName extends Error {
    constructor(message) {
        super(message)
    }
}

export class InvalidBandName extends Error {
    constructor(message) {
        super(message)
    }
}

export class InvalidLiteral extends Error {
    constructor(message) {
        super(message)
    }
}

export class InvalidCall extends Error {
    constructor(message) {
        super(message)
    }
}
