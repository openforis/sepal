import {msg} from '~/translate'

// The editors of Class Change's and Index Change's images.

// The bands a band field offers: those the source was read to provide, and the one selected where it is not among
// them - kept, to be seen and replaced. Before the source answers, the selected band alone.
export const bandOptionsOf = (available, selected) =>
    [...available, ...(selected && !available.includes(selected) ? [selected] : [])]
        .map(bandName => ({value: bandName, label: bandName}))

// What a failed read of a selected recipe says beside its field, as a failure to load it. One storage answers is gone,
// or not the user's, it leaves to the requirement over it, which says so there (changeImageRequirements.js).
export const showLoadError = (input, error) => {
    if (![403, 404].includes(error?.status)) {
        input.setInvalid(msg('widget.recipeInput.loadError'))
    }
}
