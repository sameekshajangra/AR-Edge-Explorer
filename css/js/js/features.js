// js/features.js
const Features = (() => {
  function detectORB(srcMat) {
    let gray = Preprocess.toGray(srcMat);
    let orb = new cv.ORB();
    let keypoints = new cv.KeyPointVector();
    orb.detect(gray, keypoints);
    gray.delete(); orb.delete();
    return keypoints;
  }
  return { detectORB };
})();
