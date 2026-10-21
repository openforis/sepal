import {ClientException} from '#sepal/exception'
import {UNSUPPORTED_CLASSIFIED_OUTPUT} from '#sepal/recipe/classifiedOutputs'

// A request for classified outputs its Classification does not provide is the client's to correct: refused with the
// outputs named and coded, wherever it is found - before a pixel's observations are judged (loadObservations.js) or as
// the collection is built (collection.js).
export const unsupportedClassifiedOutput = (classificationId, unsupported) =>
    new ClientException(
        `Classification ${classificationId} does not provide ${unsupported.join(', ')}`,
        {errorCode: UNSUPPORTED_CLASSIFIED_OUTPUT}
    )
