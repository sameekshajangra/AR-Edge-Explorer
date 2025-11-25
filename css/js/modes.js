// js/modes.js
const Modes = (() => {

  function canny(srcMat) {
    let gray = Preprocess.toGray(srcMat);
    let edges = new cv.Mat();
    cv.Canny(gray, edges, 50, 150);
    gray.delete();
    return edges;
  }

  function sobel(srcMat) {
    let gray = Preprocess.toGray(srcMat);
    let grad = new cv.Mat();
    cv.Sobel(gray, grad, cv.CV_8U, 1, 1);
    gray.delete();
    return grad;
  }

  function log(srcMat) {
    let gray = Preprocess.toGray(srcMat);
    let blur = new cv.Mat();
    cv.GaussianBlur(gray, blur, new cv.Size(3,3), 0);
    let lap = new cv.Mat();
    cv.Laplacian(blur, lap, cv.CV_8U);
    gray.delete(); blur.delete();
    return lap;
  }

  function dog(srcMat) {
    let gray = Preprocess.toGray(srcMat);
    let g1 = new cv.Mat(), g2 = new cv.Mat();
    cv.GaussianBlur(gray, g1, new cv.Size(3,3), 1);
    cv.GaussianBlur(gray, g2, new cv.Size(3,3), 2);
    let dst = new cv.Mat();
    cv.subtract(g1, g2, dst);
    gray.delete(); g1.delete(); g2.delete();
    return dst;
  }

  function depthLike(srcMat) {
    let gray = Preprocess.toGray(srcMat);
    let gx = new cv.Mat(), gy = new cv.Mat();
    cv.Sobel(gray, gx, cv.CV_16S, 1, 0);
    cv.Sobel(gray, gy, cv.CV_16S, 0, 1);
    cv.convertScaleAbs(gx, gx);
    cv.convertScaleAbs(gy, gy);
    let dst = new cv.Mat();
    cv.addWeighted(gx, 0.5, gy, 0.5, 0, dst);
    gray.delete(); gx.delete(); gy.delete();
    return dst;
  }

  function segment(srcMat) {
    let gray = Preprocess.toGray(srcMat);
    let dst = new cv.Mat();
    cv.threshold(gray, dst, 0, 255, cv.THRESH_OTSU);
    gray.delete();
    return dst;
  }

  return { canny, sobel, log, dog, depthLike, segment };
})();
