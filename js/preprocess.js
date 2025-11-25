// js/preprocess.js
const Preprocess = (() => {
  function toGray(srcMat) {
    let gray = new cv.Mat();
    cv.cvtColor(srcMat, gray, cv.COLOR_RGBA2GRAY);
    return gray;
  }
  function denoise(gray) {
    let dst = new cv.Mat();
    cv.GaussianBlur(gray, dst, new cv.Size(5,5), 0);
    return dst;
  }
  function equalize(gray) {
    let dst = new cv.Mat();
    cv.equalizeHist(gray, dst);
    return dst;
  }
  return { toGray, denoise, equalize };
})();
