// js/overlay.js — AR overlay combines edge heatmap + boxes from contours
function arOverlayMode(src) {
  // create edge heatmap
  let gray = new cv.Mat(); cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
  let edges = new cv.Mat(); cv.Canny(gray, edges, 50, 130);
  let norm = normalizeTo8U(edges); // reuse from modes.js
  let heat = applyJet(norm); // color RGBA

  // find contours on threshold to detect salient blobs
  let th = new cv.Mat(); cv.threshold(gray, th, 0, 255, cv.THRESH_BINARY + cv.THRESH_OTSU);
  let contours = new cv.MatVector(); let hierarchy = new cv.Mat();
  cv.findContours(th, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

  // overlay heatmap semi-transparently on original
  let out = src.clone();
  cv.addWeighted(out, 0.6, heat, 0.5, 0, out);

  // draw boxes for large contours
  for (let i = 0; i < contours.size(); i++) {
    let cnt = contours.get(i);
    let rect = cv.boundingRect(cnt);
    if (rect.width * rect.height < (src.rows * src.cols) * 0.002) { // skip tiny
      cnt.delete();
      continue;
    }
    cv.rectangle(out, new cv.Point(rect.x, rect.y), new cv.Point(rect.x + rect.width, rect.y + rect.height), [0, 255, 0, 255], 3);
    cv.putText(out, "Region", new cv.Point(rect.x, Math.max(10, rect.y - 6)), cv.FONT_HERSHEY_SIMPLEX, 0.6, [0,220,0,255], 2);
    cnt.delete();
  }

  gray.delete(); edges.delete(); norm.delete(); heat.delete(); th.delete(); contours.delete(); hierarchy.delete();
  return out;
}
