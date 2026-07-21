import ee from '#sepal/ee/ee'
/**
 * PyEO Change Alerts — GEE function.
 *
 * The input parameters and output band spec below are the contract between
 * UoL and SEPAL. Implementation strategy is up to you (per-image .map(),
 * ImageCollection.iterate with running state, two-pass, ...).
 *
 * This function does not classify. It receives baseline and monitoring
 * inputs that already carry a 'class' band; the SEPAL recipe wrapper
 * applies the user's classification recipe before calling in.
 *
 * @param {Object} params
 * @param {ee.Geometry|ee.FeatureCollection} params.aoi
 *     Area of interest. Output should be clipped to this.
 * @param {ee.Image} params.classifiedBaseline
 *     Baseline classification map with a 'class' band (integer class IDs).
 *     If params.indexGate is set, must also carry the gate index band
 *     (`gate_index`).
 * @param {ee.ImageCollection} params.classifiedMonitoringCollection
 *     Monitoring images, time-sorted (system:time_start ascending). Each
 *     image carries the same 'class' band (and optional gate band) as the
 *     baseline.
 * @param {number[]} params.changeFromClasses
 *     Class IDs that, in the BASELINE, count as the "from" side of a change.
 * @param {number[]} params.changeToClasses
 *     Class IDs that, in any MONITORING image, count as the "to" side.
 * @param {number} [params.minConsecutiveDetections=2]
 *     Temporal-confidence parameter. Interpretation up to the algorithm.
 * @param {{index: string, threshold: number}} [params.indexGate]
 *     Optional spectral confirmation: alert is confirmed only when the
 *     `index` drops by at least `threshold` vs. the baseline.
 *
 * @returns {ee.Image} Multi-band alert raster, clipped to AOI. Required bands:
 *     - first_change_date   days since 2000-01-01, masked where no alert
 *     - detection_count     total monitoring images flagged at this pixel
 *     - consecutive_count   longest consecutive run of detections
 *     - from_class          baseline class ID at the alert pixel
 *     - to_class            most recent monitoring class ID at the alert pixel
 *     - confidence          [0..1]
 *     - dindex_drop         (only when indexGate is set) index change at confirmation
 *
 *     Pixels with no alert should be masked out. The output band names are
 *     part of the contract — SEPAL's wrapper references them. If the
 *     algorithm needs a different schema, flag it so we update both sides.
 *
 *     Keep the body server-side. Use .map() / .iterate() / ee.Algorithms.If.
 *     Avoid .getInfo() and JS for-loops over ee.List — they fail at scale.
 */
 // 
 // potential inputs: index-gate boolean (on/off), index threshold
 //
export const runPyeoChangeAlerts = params => {
  // ==============================================================================
  // 1. INPUT PARAMETERS
  // ==============================================================================
  var aoi = params.aoi
  var classifiedBaseline = params.classifiedBaseline
  var classifiedMonitoringCollection = params.classifiedMonitoringCollection
  var changeFromClasses = params.changeFromClasses
  var changeToClasses = params.changeToClasses
  var minRequiredValidatedDetectionsThreshold = params.minRequiredValidatedDetectionsThreshold || 2
  var minRequiredClassifierDetectionsThreshold = params.minRequiredClassifierDetectionsThreshold || 5
  var percentageProbabilityThreshold = params.percentageProbabilityThreshold || 50
  var minRequiredFromDetectionsThreshold = params.minRequiredFromDetectionsThreshold || 2
  var minRequiredToDetectionsThreshold = params.minRequiredToDetectionsThreshold || 2
  var indexGate = params.indexGate || {use: false, index: 'ndvi', threshold: 0.3, minRequiredDeltaIndexDetectionsThreshold: 5}
  
  // if user has opted to not use the index gate (as a threshold), then set threshold to let all detections through
  // if (!(indexGate.use)) {
  //   indexGate.threshold = -2.0
  // }
  // if no minimum index-drop detections past the threshold argument is supplied, this is the default
  if (!(indexGate.minRequiredDeltaIndexDetectionsThreshold)) {
    indexGate.minRequiredDeltaIndexDetectionsThreshold = 5
  }

  // ==============================================================================
  // 2. CHANGE DETECTION LOGIC
  // ==============================================================================

  var baselineClassification = classifiedBaseline.select("classification");
  var baselineIndex = classifiedBaseline.select("gate_index");
  
  // create a fromMask that works for multiple classes
  // this mask is used to count changes for pixels from a FROM class to a TO class
  var fromMask = ee.ImageCollection(
    changeFromClasses.map(function(classId) {
      return baselineClassification.eq(classId)
    })
    ).max(); // max() works as a logical OR across the imagecollection

  // ************
  // set up the logic to map over the classified monitoring collection 
  // ************
  // to locate the valid change event pixels per image
  // concats 3 bands to each image of the monitoring collection
  // e.g. 38 images with 2 bands each, becomes 38 images with 5 bands each

  // ==============================================================================
  // 2A. changeEvents LOGIC
  // ==============================================================================

  var changeEvents = classifiedMonitoringCollection.map(function(image) {
    var currentClass = image.select("classification");
    var currentIndex = image.select("gate_index");

    // ************
    // for each image, identify where pixels are a FROM class in the monitoring collection
    // this describes the consistency of each pixel as a FROM class
    var isFromClass = ee.ImageCollection(
      changeFromClasses.map(function(classId) {
        return currentClass.eq(classId);
      })
    ).max().rename("is_from_class");
    // ************

    // ************
    // for each image, identify where pixels are a TO class in the monitoring collection
    // this describes the consistency of each pixel as a TO class
    var isToClass = ee.ImageCollection(
      changeToClasses.map(function(classId) {
        return currentClass.eq(classId);
      })
    ).max().rename("is_to_class");
    // ************

    // identify which pixels have changed to ChangeToClasses
    var transitionMask = fromMask.and(isToClass).rename("transition_mask"); // using a mask allows for .and to work
      
    // calculate whether the index dropped by at least the threshold vs baseline
    var deltaIndex = baselineIndex.subtract(currentIndex).rename("delta_index");
    var deltaIndexThresholdedMask = deltaIndex.gte(indexGate.threshold).rename("delta_index_thresholded_mask"); // boolean of whether a pixel passed the evaluation

    // flag where both conditions (class and index drop) are met
    var isChangeMask = transitionMask.and(deltaIndexThresholdedMask).rename("is_change");
      
    // store the image_date as a band for change reporting
    var imgMillis = ee.Image.constant(image.getNumber("system:time_start"));
    var imgMillisGeneric = imgMillis.double();
    
    // build dates of all changes above the index threshold
    var changeDateAboveThreshold = imgMillisGeneric.updateMask(isChangeMask).rename("change_date_above_threshold")

    return image.addBands([isChangeMask, changeDateAboveThreshold, deltaIndexThresholdedMask, deltaIndex, isFromClass, isToClass, currentClass, transitionMask]);
  }); // end of changeEvents function
  // an imagecollection, each image has the six bands above

  // ==============================================================================
  // 2B. postChangeEvaluation LOGIC
  // ==============================================================================

  // get the first change date per pixel
  var firstChangeDateAboveThreshold = changeEvents.select("change_date_above_threshold").min().rename("first_change_date_above_threshold");

  // map over the change images in changeEvents a second time, to evaluate temporal consistency of the first changes
  var postChangeEvaluation = changeEvents.map(function(image) {
    // get the timestamp, cast to double to ensure homogeneity of types
    var currentMillis = ee.Image.constant(image.getNumber("system:time_start")).double();

    // create a temporal window mask
    // pixel has a value of 1 if it has a change that is the first change or is afterwards
    var isAfterFirstChange = currentMillis.gte(firstChangeDateAboveThreshold);
    var isPostFCD = isAfterFirstChange.rename("post_fcd"); // boolean (1, 0) indicating whether the pixel is post-FCD
    var isChange = image.select("is_change") // 1 for change, 0 for no change
    // here find out if masked, then unmasked and eq
    // var isPostFCDOccluded = isPostFCD.mask().unmask(0).eq(0).rename("post_fcd_occluded") 

    var isOccluded = image.select("classification").mask().not();
    
    // combine first change date with whether was occluded
    // we unmask isAfterFirstChange to 0. If a pixel never had a first change, 
    // it cannot have post-FCD occlusions, so we force it to 0 instead of leaving it masked
    var isPostFCDOccluded = isOccluded.and(isAfterFirstChange.unmask(0)).rename("post_fcd_occluded");

    // a pixel had a change after after FCD
    var subsequentChange = isChange.and(isAfterFirstChange).rename("post_fcd_change")

    // a pixel did not have a new change after a FCD
    var isNotChange = isChange.not(); // turns 0s (no change) to 1s and vice versa - 1s (change) to 0s
    var subsequentNonChange = isNotChange.and(isAfterFirstChange).rename("post_fcd_nochange");

    // return an imagecollection of images with two bands each, of subsquent change and non-change
    return image.addBands([subsequentChange, subsequentNonChange, isPostFCD, isPostFCDOccluded]);
  });
  
  // ==============================================================================
  // 3. COMPILING CHANGE REPORT LAYERS
  // ==============================================================================

  // LAYER 0: count the number of images within the collection
  var availableImageCount = ee.Image(
    ee.Image.constant(classifiedMonitoringCollection.size()))
    .clip(aoi)
    .rename("available_image_count");
    
  // LAYER 1: count the number of occluded images per pixel
  var occludedCount = classifiedMonitoringCollection.map(function(image) {
    var isOccluded = image.select("classification").mask().unmask(0).eq(0);
    // .mask() returns a 1 for valid pixels and is masked for cloudy pixels
    // unmask(0) converts these cloudy pixels to 0, but it also respects the image footprint
    // and leaves pixels outside of the image boundary fully masked
    // .eq(0) turns the 0s (clouds) into 1s so these can be summed and counted
    return isOccluded.rename("occluded_count");
  }).sum();

  // LAYER 2: class change detection count - how many times a pixel changed from a FROM class to a TO class
  var classChangeDetectionCount = changeEvents.select("is_change").sum().rename("total_changes")

  // LAYER 3: firstChangeDate (FCD) and Combined Alert Detection (changes that pass the index threshold)
  // firstChangeDateAboveThreshold computed above

  // LAYER 4: Post-FCD Combined Alert Count (count of changes that pass the index threshold since the first change date)
  // get the counts by summing the post-FCD change
  var postFCDChangeCount = postChangeEvaluation.select("post_fcd_change").sum().rename("post_fcd_change_count");

  // LAYER 5: Post-FCD Combined Non-Alert Count (count of no changes since the first change date)
  // get the counts by summing the post-FCD no changes
  var postFCDNoChangeCount = postChangeEvaluation.select("post_fcd_nochange").sum().rename("post_fcd_nochange_count");

  // LAYER 6: Post-FCD Occluded Image Count
  var postFCDOccludedCount = postChangeEvaluation.select("post_fcd_occluded").sum().rename("post_fcd_occluded_count");

  // LAYER 7: Post-FCD Valid Image Count
  var postFCDValidImageCount = postFCDChangeCount.add(postFCDNoChangeCount).rename("post_fcd_valid_image_count");

  // LAYER 8: Post-FCD Change Detection Repeatability
  var postFCDChangeDetectionRepeatability = postFCDChangeCount
    .divide(postFCDValidImageCount)
    .multiply(100)
    .rename("post_fcd_change_repeatability_pct");

  // LAYER 9: Binary time-series decision
  var binaryTimeSeriesDecision = postFCDChangeDetectionRepeatability.gte(percentageProbabilityThreshold)
    .and(postFCDChangeCount.gte(minRequiredValidatedDetectionsThreshold))
    .rename("binary_timeseries_decision");

  // LAYER 10: FCD Decision Map
  var FCDDecisionMap = firstChangeDateAboveThreshold
    .updateMask(binaryTimeSeriesDecision)
    .rename("fcd_decision_map");

  // LAYER 11: index-drop only change detection count
  var deltaIndexChangeDetectionCount = changeEvents
    .select("delta_index_thresholded_mask")
    .sum()
    .rename("delta_index_change_count");

  // LAYER 12: Binary index-drop Alert Decision Map
  var binaryDeltaIndexDecisionMap = deltaIndexChangeDetectionCount.gte(indexGate.minRequiredDeltaIndexDetectionsThreshold)
    .rename("binary_delta_index_decision_map");

  // LAYER 13: Binary dClass Alert Decision Map // class-only, ignoring the index gate
  var classChangeDetectionCountNoGate = changeEvents.select("transition_mask").sum().rename("total_class_changes_no_gate")

  var binaryDeltaClassDecisionMap = classChangeDetectionCountNoGate.gte(minRequiredClassifierDetectionsThreshold)
    .rename("binary_delta_class_decision_map");

  // LAYER 14: Combined index-drop & dClass Decision Map
  var binaryCombinedDeltaDecisionMap = binaryDeltaClassDecisionMap.and(binaryDeltaIndexDecisionMap)
    .rename("binary_combined_delta_decision_map");

  // LAYER 15: count the number of pixels that were a FROM class
  // "counts" by summing across the collection https://developers.google.com/earth-engine/apidocs/ee-imagecollection-sum
  var fromClassCount = changeEvents.select("is_from_class").sum().rename("from_class_count");
  // ************

  // LAYER 16: count the number of pixels that were a TO class
  var toClassCount = changeEvents.select("is_to_class").sum().rename("to_class_count");

  // LAYER 17: L15.and(L16) Binary Decision Thresholds on FROM and TO classification counts
  var binaryDecisionFromToMap = fromClassCount.gte(minRequiredFromDetectionsThreshold)
    .and(toClassCount.gte(minRequiredToDetectionsThreshold))
    .rename("binary_decision_from_to_map");

  return ee.Image([
    availableImageCount,
    occludedCount,
    classChangeDetectionCount,
    firstChangeDateAboveThreshold,
    postFCDChangeCount,
    postFCDNoChangeCount,
    postFCDOccludedCount,
    postFCDValidImageCount,
    postFCDChangeDetectionRepeatability,
    binaryTimeSeriesDecision,
    FCDDecisionMap,
    deltaIndexChangeDetectionCount,
    binaryDeltaIndexDecisionMap,
    binaryDeltaClassDecisionMap,
    binaryCombinedDeltaDecisionMap,
    fromClassCount,
    toClassCount,
    binaryDecisionFromToMap
  ]);
}