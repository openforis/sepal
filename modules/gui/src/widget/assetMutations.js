import _ from 'lodash'

import {actionBuilder} from '~/action-builder'

// Assets this session created, deleted or renamed, by their paths, with the folders or collections holding them: what
// reads any of them learns its evidence is stale at once and reads it again (sourceRuntime/assetRefresh.js). The asset
// listing itself converges through the user-assets service, which rescans what changed.
export const assetsMutated = paths => actionBuilder('ASSETS_MUTATED')
    .set('assets.mutation', {
        ids: _.uniq(paths.flatMap(path => [path.join('/'), path.slice(0, -1).join('/')]).filter(Boolean)),
        at: Date.now()
    })
    .dispatch()
