import _ from 'lodash'

// What a recipe computes from, for anything answering about its output: its persisted content.
//
// The revision is not. It is the server acknowledging a save, and a map's own layout is saved inside the recipe -
// so restyling an area advances it while the computation stays exactly where it was. The title and the layout
// change nothing computed either, and the rest of `ui` is session state - runtime evidence about its sources
// included, which offers presets and prefill and says nothing about what is computed. Whether a record is BEHIND
// what is persisted is a different question, which sourceEvidenceSync answers with the revision; whether the pixels
// its sources supply may have changed is pixelGeneration.js's.
export const recipeContent = recipe =>
    _.omit(recipe, ['ui', 'layers', 'title', 'revision'])
