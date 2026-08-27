import {SELF_MANAGED_VISUALIZATIONS} from '~/app/home/body/process/recipe/recipeImageLayer'

// landTrendrImageLayer reconciles visParams itself, because the available bands
// differ between the changes and mosaics modes. If the generic reconciliation in
// recipeImageLayer stays active as well, the two disagree - it picks from the
// change presets, the layer form picks from the mosaic presets - and they
// overwrite each other until React aborts with "Maximum update depth exceeded".
it('leaves visParams reconciliation to the LandTrendr layer form', () => {
    expect(SELF_MANAGED_VISUALIZATIONS).toContain('LANDTRENDR')
})
