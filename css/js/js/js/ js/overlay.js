// js/overlay.js
const Overlay = (() => {
  function drawKeypoints(srcMat, keypoints) {
    let out = new cv.Mat();
    cv.drawKeypoints(srcMat, keypoints, out, [0,255,0,255]);
    return out;
  }

  function drawRectOnCanvas(ctx, x,y,w,h, color='#22ff22', thickness=4) {
    ctx.strokeStyle = color; ctx.lineWidth = thickness;
    ctx.strokeRect(x,y,w,h);
  }

  return { drawKeypoints, drawRectOnCanvas };
})();
