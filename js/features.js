// js/features.js — draw more visible keypoints (large circles + labels)
function featureMode(src) {
  let gray = new cv.Mat(); cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);

  let orb = new cv.ORB();
  let keypoints = new cv.KeyPointVector();
  orb.detect(gray, keypoints);

  // draw colored circles on a copy of src
  let out = src.clone();
  for (let i = 0; i < keypoints.size(); ++i) {
    let kp = keypoints.get(i);
    let x = Math.round(kp.pt.x), y = Math.round(kp.pt.y);
    let r = Math.max(2, Math.round(kp.size/2));
    cv.circle(out, new cv.Point(x,y), r, [0,255,0,255], 2);
  }

  gray.delete(); orb.delete(); keypoints.delete();
  return out;
}
