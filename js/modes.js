// js/modes.js — improved visual differences and color mapping
// Requires OpenCV.js

// utility: normalize a single-channel Mat to 0..255 CV_8U
function normalizeTo8U(mat) {
  let out = new cv.Mat();
  cv.normalize(mat, out, 0, 255, cv.NORM_MINMAX);
  out.convertTo(out, cv.CV_8U);
  return out;
}

// apply a colormap (JET) to a single-channel CV_8U Mat and return RGBA Mat
function applyJet(mat8u) {
  let color = new cv.Mat();
  cv.applyColorMap(mat8u, color, cv.COLORMAP_JET);
  // convert BGR->RGBA for consistent display pipeline
  let out = new cv.Mat();
  cv.cvtColor(color, out, cv.COLOR_BGR2RGBA);
  color.delete();
  return out;
}

function cannyMode(src) {
  let gray = new cv.Mat(); cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
  let edges = new cv.Mat();
  // adaptive thresholds produce clearer edges
  cv.Canny(gray, edges, 40, 120);
  // colorize edges and overlay on original
  let edgeColor = new cv.Mat();
  cv.cvtColor(edges, edgeColor, cv.COLOR_GRAY2RGBA);
  let overlay = src.clone();
  // highlight edges in red by blending
  for (let r = 0; r < overlay.rows; r++) {
    for (let c = 0; c < overlay.cols; c++) {
      if (edges.ucharPtr(r, c)[0] > 0) {
        overlay.ucharPtr(r, c)[0] = Math.min(255, overlay.ucharPtr(r, c)[0] + 80); // B
        overlay.ucharPtr(r, c)[1] = Math.max(0, overlay.ucharPtr(r, c)[1] - 80);   // G
        overlay.ucharPtr(r, c)[2] = Math.max(0, overlay.ucharPtr(r, c)[2] - 80);   // R (note RGBA order in imshow)
        // alpha not used in canvas display
      }
    }
  }
  gray.delete(); edges.delete(); edgeColor.delete();
  return overlay;
}

function sobelMode(src) {
  let gray = new cv.Mat(); cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
  let gx = new cv.Mat(), gy = new cv.Mat();
  cv.Sobel(gray, gx, cv.CV_16S, 1, 0, 3);
  cv.Sobel(gray, gy, cv.CV_16S, 0, 1, 3);
  let ax = new cv.Mat(), ay = new cv.Mat();
  cv.convertScaleAbs(gx, ax);
  cv.convertScaleAbs(gy, ay);
  let mag = new cv.Mat();
  cv.addWeighted(ax, 0.6, ay, 0.6, 0, mag);
  let norm = normalizeTo8U(mag);
  let colored = applyJet(norm);
  // cleanup
  gray.delete(); gx.delete(); gy.delete(); ax.delete(); ay.delete(); mag.delete(); norm.delete();
  return colored;
}

function logMode(src) {
  let gray = new cv.Mat(); cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
  let blur = new cv.Mat(); cv.GaussianBlur(gray, blur, new cv.Size(5,5), 0);
  let lap = new cv.Mat();
  cv.Laplacian(blur, lap, cv.CV_16S, 3);
  let lapAbs = new cv.Mat(); cv.convertScaleAbs(lap, lapAbs);
  // enhance contrast
  let norm = normalizeTo8U(lapAbs);
  let colored = applyJet(norm);
  gray.delete(); blur.delete(); lap.delete(); lapAbs.delete(); norm.delete();
  return colored;
}

function dogMode(src) {
  let gray = new cv.Mat(); cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
  let g1 = new cv.Mat(), g2 = new cv.Mat();
  cv.GaussianBlur(gray, g1, new cv.Size(3,3), 1.0);
  cv.GaussianBlur(gray, g2, new cv.Size(7,7), 2.5);
  let diff = new cv.Mat();
  cv.absdiff(g1, g2, diff);
  // amplify small differences for visibility
  let amplified = new cv.Mat();
  diff.convertTo(amplified, cv.CV_32F);
  cv.multiply(amplified, new cv.Mat(amplified.rows, amplified.cols, amplified.type(), [3.0]), amplified);
  let norm = normalizeTo8U(amplified);
  let colored = applyJet(norm);
  gray.delete(); g1.delete(); g2.delete(); diff.delete(); amplified.delete(); norm.delete();
  return colored;
}

function depthMode(src) {
  // gradient magnitude + vertical weighting -> color depth-like heatmap
  let gray = new cv.Mat(); cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
  let gx = new cv.Mat(), gy = new cv.Mat();
  cv.Sobel(gray, gx, cv.CV_16S, 1, 0, 3);
  cv.Sobel(gray, gy, cv.CV_16S, 0, 1, 3);
  let ax = new cv.Mat(), ay = new cv.Mat();
  cv.convertScaleAbs(gx, ax); cv.convertScaleAbs(gy, ay);
  let mag = new cv.Mat(); cv.addWeighted(ax, 0.6, ay, 0.6, 0, mag);

  // vertical weighting: near-bottom = nearer (multiply rows by ramp)
  let rows = mag.rows, cols = mag.cols;
  let weighted = new cv.Mat(rows, cols, mag.type());
  for (let r = 0; r < rows; r++) {
    let weight = 0.4 + 0.6 * (r / (rows - 1)); // 0.4 .. 1.0
    for (let c = 0; c < cols; c++) {
      weighted.ucharPtr(r,c)[0] = Math.min(255, Math.round(mag.ucharPtr(r,c)[0] * weight));
    }
  }

  let norm = normalizeTo8U(weighted);
  let colored = applyJet(norm);
  gray.delete(); gx.delete(); gy.delete(); ax.delete(); ay.delete(); mag.delete(); weighted.delete(); norm.delete();
  return colored;
}

function segmentMode(src) {
  // OTSU + color fill of mask on original
  let gray = new cv.Mat(); cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
  let mask = new cv.Mat();
  cv.threshold(gray, mask, 0, 255, cv.THRESH_BINARY + cv.THRESH_OTSU);

  // create color overlay (green) where mask==255
  let overlay = src.clone();
  for (let r = 0; r < overlay.rows; r++) {
    for (let c = 0; c < overlay.cols; c++) {
      if (mask.ucharPtr(r,c)[0] > 0) {
        // emphasize region: tint green
        overlay.ucharPtr(r,c)[1] = Math.min(255, overlay.ucharPtr(r,c)[1] + 90);
        overlay.ucharPtr(r,c)[0] = Math.max(0, overlay.ucharPtr(r,c)[0] - 40);
        overlay.ucharPtr(r,c)[2] = Math.max(0, overlay.ucharPtr(r,c)[2] - 40);
      }
    }
  }

  gray.delete(); mask.delete();
  return overlay;
}
