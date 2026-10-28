import assert from 'node:assert/strict'
import {describe, it} from 'node:test'

import {failure, failureKind} from '../../verify/eeFailures.mjs'

// Earth Engine reports an asset that is missing and one the caller may not see with the same words, so
// NOT_VISIBLE is as far as a message goes. A creation attempt may follow it, because creating cannot overwrite;
// a deletion may not be called done.

// Captured verbatim from live Earth Engine on 2026-09-18, through ee.data.getAsset, ee.data.listAssets and a
// computation loading a missing asset.
const CAPTURED = {
    missing: 'Asset \'projects/p/assets/sepal_missing_1\' does not exist or doesn\'t allow this operation.',
    missingLegacy: 'Asset "projects/earthengine-legacy/assets/users/nobody/nothing" not found.',
    missingProject: 'Resource projects/google could not be found.',
    missingInComputation: 'Image.load: Image asset \'projects/p/assets/sepal_missing_1\' not found '
        + '(does not exist or caller does not have access).',
    missingCollectionInComputation: 'ImageCollection.load: ImageCollection asset \'projects/p/assets/x\' not found '
        + '(does not exist or caller does not have access).'
}

// The Earth Engine client's own wording, from its source: what it reports when a failed response carries no
// JSON error body.
const clientStatus = status => `Server returned HTTP code: ${status} for GET https://earthengine.googleapis.com/v1/x`
const CLIENT_UNREACHABLE =
    'Failed to contact Earth Engine servers. Please check your connection, firewall, or browser extension settings.'

describe('what Earth Engine says about an asset it will not return', () => {
    it('reads every captured message as not visible', () => {
        assert.equal(failureKind(CAPTURED.missing), 'NOT_VISIBLE')
        assert.equal(failureKind(CAPTURED.missingLegacy), 'NOT_VISIBLE')
        assert.equal(failureKind(CAPTURED.missingProject), 'NOT_VISIBLE')
        assert.equal(failureKind(CAPTURED.missingInComputation), 'NOT_VISIBLE')
        assert.equal(failureKind(CAPTURED.missingCollectionInComputation), 'NOT_VISIBLE')
    })

    // Earth Engine hands the callback a plain string. An error object is the exception, not the rule.
    it('reads the string Earth Engine passes as well as an Error carrying it', () => {
        assert.equal(failureKind(CAPTURED.missingLegacy), 'NOT_VISIBLE')
        assert.equal(failureKind(new Error(CAPTURED.missingLegacy)), 'NOT_VISIBLE')
        assert.deepEqual(
            failure(CAPTURED.missingLegacy),
            {status: 'NOT_VISIBLE', error: CAPTURED.missingLegacy}
        )
    })
})

// Synthetic: the captured structures carrying asset ids built out of the words the classifier reads. An id is
// the one part of a message the caller chooses, so it must not decide what the message means.
describe('an asset id that reads like a failure', () => {
    it('does not take an error out of a quoted id', () => {
        assert.equal(
            failureKind('Asset "projects/p/assets/network-project" not found.'),
            'NOT_VISIBLE'
        )
        assert.equal(
            failureKind('Asset \'projects/p/assets/permission_probe\' does not exist or doesn\'t allow this operation.'),
            'NOT_VISIBLE'
        )
        assert.equal(
            failureKind('Asset "projects/p/assets/tile-403" not found.'),
            'NOT_VISIBLE'
        )
        assert.equal(
            failureKind('Asset "projects/p/assets/socket hang up" not found.'),
            'NOT_VISIBLE'
        )
    })

    it('does not take an error out of an unquoted project or a url', () => {
        assert.equal(
            failureKind('Resource projects/network-project could not be found.'),
            'NOT_VISIBLE'
        )
        assert.equal(
            failureKind('Server returned HTTP code: 404 for GET https://ee.googleapis.com/v1/assets/tile-403'),
            'NOT_VISIBLE'
        )
    })

    it('does not take an error out of an id inside a computation message', () => {
        assert.equal(
            failureKind('Image.load: Image asset \'projects/p/assets/forbidden_500\' not found '
                + '(does not exist or caller does not have access).'),
            'NOT_VISIBLE'
        )
    })
})

describe('what the client says when it could not ask', () => {
    it('reads its status wording, and only its status wording, as the status', () => {
        assert.equal(failureKind(clientStatus(404)), 'NOT_VISIBLE')
        assert.equal(failureKind(clientStatus(403)), 'PERMISSION_DENIED')
        assert.equal(failureKind(clientStatus(401)), 'PERMISSION_DENIED')
        assert.equal(failureKind(clientStatus(503)), 'TRANSPORT')
        assert.equal(failureKind(clientStatus(0)), 'TRANSPORT')
    })

    it('reads an unreachable server and a dropped connection as transport', () => {
        assert.equal(failureKind(CLIENT_UNREACHABLE), 'TRANSPORT')
        assert.equal(failureKind('socket hang up'), 'TRANSPORT')
        assert.equal(
            failureKind('getaddrinfo EAI_AGAIN earthengine.googleapis.com'),
            'TRANSPORT'
        )
    })

    it('reads a stated refusal as a refusal', () => {
        assert.equal(failureKind('Permission denied on asset'), 'PERMISSION_DENIED')
        assert.equal(failureKind('Caller is not authorized'), 'PERMISSION_DENIED')
    })
})

describe('wording nobody has seen', () => {
    it('leaves it unresolved rather than guessing', () => {
        assert.equal(failureKind('Asset not found; caller does not have access (403)'), 'OTHER')
        assert.equal(failureKind('Image.select: Pattern did not match any bands.'), 'OTHER')
        assert.equal(failureKind(undefined), 'OTHER')
    })
})
