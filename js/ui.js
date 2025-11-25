// js/ui.js (Integrated: Modes + Features + Overlay + Robust UI loop + Screenshot fix)
// Expects these HTML elements (ids): video, canvas, mode, screenshot, switchCamera, fps
// Make sure modes/features/overlay scripts are NOT separately loaded if you replace them with this single file.

(() => {
  // --- UI elements ---
  const video = document.getElementById("video");
  const canvas = document.getElementById("canvas");
  const ctx = canvas.getContext("2d");
  const modeSelect = document.getElementById("mode");
  const screenshotBtn = document.getElementById("screenshot");
  const switchCameraBtn = document.getElementById("switchCamera");
  const fpsLabel = document.getElementById("fps");

  // --- state ---
  let cvReady = false;
  let videoReady = false;
  let running = false;
  let lastFpsTime = performance.now();
  let frameCount = 0;
  let stream = null;
  let currentFacingMode = "environment"; // try back camera first

  // -----------------------
  // Helper functions (used by modes)
  // -----------------------
  function normalizeTo8U(mat) {
    const out = new cv.Mat();
    cv.normalize(mat, out, 0, 255, cv.NORM_MINMAX);
    out.convertTo(out, cv.CV_8U);
    return out;
  }

  function applyJet(mat8u) {
    const color = new cv.Mat();
    cv.applyColorMap(mat8u, color, cv.COLORMAP_JET);
    const out = new cv.Mat();
    cv.cvtColor(color, out, cv.COLOR_BGR2RGBA);
    color.delete();
    return out;
  }

    // -----------------------
  // Modes object (VERY visually distinct outputs)
  // -----------------------
  const Modes = {
    // 1) CANNY → pure edge map (white on black)
    canny: function(src) {
      const gray = new cv.Mat(); 
      cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
      const edges = new cv.Mat();
      cv.Canny(gray, edges, 80, 160);   // strong thresholds

      // show as plain white edges on black
      const out = new cv.Mat();
      cv.cvtColor(edges, out, cv.COLOR_GRAY2RGBA);

      gray.delete(); 
      edges.delete();
      return out;
    },

    // 2) SOBEL → colorful gradient heatmap
    sobel: function(src) {
      const gray = new cv.Mat(); 
      cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
      const gx = new cv.Mat(), gy = new cv.Mat();
      cv.Sobel(gray, gx, cv.CV_16S, 1, 0, 3);
      cv.Sobel(gray, gy, cv.CV_16S, 0, 1, 3);

      const ax = new cv.Mat(), ay = new cv.Mat();
      cv.convertScaleAbs(gx, ax);
      cv.convertScaleAbs(gy, ay);

      const mag = new cv.Mat();
      cv.addWeighted(ax, 0.5, ay, 0.5, 0, mag);

      // normalize and color map
      const norm = new cv.Mat();
      cv.normalize(mag, norm, 0, 255, cv.NORM_MINMAX);
      norm.convertTo(norm, cv.CV_8U);

      const color = new cv.Mat();
      cv.applyColorMap(norm, color, cv.COLORMAP_JET);

      // BGR -> RGBA
      const out = new cv.Mat();
      cv.cvtColor(color, out, cv.COLOR_BGR2RGBA);

      gray.delete(); gx.delete(); gy.delete(); ax.delete(); ay.delete(); mag.delete(); norm.delete(); color.delete();
      return out;
    },

    // 3) LoG → strong Laplacian, inverted look
    log: function(src) {
      const gray = new cv.Mat(); 
      cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);

      const blur = new cv.Mat();
      cv.GaussianBlur(gray, blur, new cv.Size(5,5), 0);

      const lap = new cv.Mat();
      cv.Laplacian(blur, lap, cv.CV_16S, 3);

      const lapAbs = new cv.Mat();
      cv.convertScaleAbs(lap, lapAbs);

      // invert for high contrast
      const inv = new cv.Mat();
      cv.bitwise_not(lapAbs, inv);

      const out = new cv.Mat();
      cv.cvtColor(inv, out, cv.COLOR_GRAY2RGBA);

      gray.delete(); blur.delete(); lap.delete(); lapAbs.delete(); inv.delete();
      return out;
    },

    // 4) DoG → red/yellow structure map
    dog: function(src) {
      const gray = new cv.Mat(); 
      cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);

      const g1 = new cv.Mat(), g2 = new cv.Mat();
      cv.GaussianBlur(gray, g1, new cv.Size(3,3), 1.0);
      cv.GaussianBlur(gray, g2, new cv.Size(7,7), 2.5);

      const diff = new cv.Mat();
      cv.absdiff(g1, g2, diff);

      // normalize to 0..255
      const norm = new cv.Mat();
      cv.normalize(diff, norm, 0, 255, cv.NORM_MINMAX);
      norm.convertTo(norm, cv.CV_8U);

      // convert to RGBA and tint red/yellow
      const out = new cv.Mat();
      cv.cvtColor(norm, out, cv.COLOR_GRAY2RGBA);
      for (let r = 0; r < out.rows; r++) {
        for (let c = 0; c < out.cols; c++) {
          const v = out.ucharPtr(r,c)[0]; // gray value
          // B,G,R roughly → orange/yellow ramp
          out.ucharPtr(r,c)[0] = Math.min(255, v * 0.2);  // B
          out.ucharPtr(r,c)[1] = Math.min(255, v * 0.8);  // G
          out.ucharPtr(r,c)[2] = Math.min(255, v * 1.2);  // R
        }
      }

      gray.delete(); g1.delete(); g2.delete(); diff.delete(); norm.delete();
      return out;
    },

    // 5) Depth-like → vertical heatmap (bottom = near)
    depthLike: function(src) {
      const gray = new cv.Mat(); 
      cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
      const gx = new cv.Mat(), gy = new cv.Mat();
      cv.Sobel(gray, gx, cv.CV_16S, 1, 0, 3);
      cv.Sobel(gray, gy, cv.CV_16S, 0, 1, 3);

      const ax = new cv.Mat(), ay = new cv.Mat();
      cv.convertScaleAbs(gx, ax);
      cv.convertScaleAbs(gy, ay);

      const mag = new cv.Mat();
      cv.addWeighted(ax, 0.5, ay, 0.5, 0, mag);

      // apply vertical ramp
      const rows = mag.rows, cols = mag.cols;
      const weighted = new cv.Mat(rows, cols, mag.type());
      for (let r = 0; r < rows; r++) {
        const w = 0.3 + 0.7 * (r / (rows - 1)); // top dark, bottom bright
        for (let c = 0; c < cols; c++) {
          const v = mag.ucharPtr(r,c)[0];
          weighted.ucharPtr(r,c)[0] = Math.min(255, Math.round(v * w));
        }
      }

      const norm = new cv.Mat();
      cv.normalize(weighted, norm, 0, 255, cv.NORM_MINMAX);
      norm.convertTo(norm, cv.CV_8U);

      const color = new cv.Mat();
      cv.applyColorMap(norm, color, cv.COLORMAP_JET);
      const out = new cv.Mat();
      cv.cvtColor(color, out, cv.COLOR_BGR2RGBA);

      gray.delete(); gx.delete(); gy.delete(); ax.delete(); ay.delete(); mag.delete(); weighted.delete(); norm.delete(); color.delete();
      return out;
    },

    // 6) Segmentation → foreground tinted green, background dark
    segment: function(src) {
      const gray = new cv.Mat(); 
      cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);

      const mask = new cv.Mat();
      cv.threshold(gray, mask, 0, 255, cv.THRESH_BINARY + cv.THRESH_OTSU);

      const out = src.clone();
      for (let r = 0; r < out.rows; r++) {
        for (let c = 0; c < out.cols; c++) {
          if (mask.ucharPtr(r,c)[0] > 0) {
            // foreground → bright greenish
            out.ucharPtr(r,c)[1] = Math.min(255, out.ucharPtr(r,c)[1] + 100); // G
          } else {
            // background → darkened
            out.ucharPtr(r,c)[0] = out.ucharPtr(r,c)[0] * 0.3;
            out.ucharPtr(r,c)[1] = out.ucharPtr(r,c)[1] * 0.3;
            out.ucharPtr(r,c)[2] = out.ucharPtr(r,c)[2] * 0.3;
          }
        }
      }

      gray.delete(); mask.delete();
      return out;
    }
  }; // end Modes


  // -----------------------
  // Features object
  // -----------------------
  const Features = {
    detectORB: function(src) {
      const gray = new cv.Mat(); cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
      const orb = new cv.ORB();
      const keypoints = new cv.KeyPointVector();
      try {
        orb.detect(gray, keypoints);
      } catch (e) {
        console.warn("ORB detect error:", e);
      }
      gray.delete();
      orb.delete();
      return keypoints;
    }
  };

  // -----------------------
  // Overlay object
  // -----------------------
  const Overlay = {
    drawKeypoints: function(src, keypoints) {
      // Draw visible circles on a copy of source
      const out = src.clone();
      for (let i = 0; i < keypoints.size(); ++i) {
        const kp = keypoints.get(i);
        const x = Math.round(kp.pt.x), y = Math.round(kp.pt.y);
        const r = Math.max(2, Math.round(kp.size / 2));
        cv.circle(out, new cv.Point(x, y), r, [0, 255, 0, 255], 2);
      }
      return out;
    },

    arOverlayMode: function(src) {
      // edge heatmap + contours -> boxes
      const gray = new cv.Mat(); cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
      const edges = new cv.Mat(); cv.Canny(gray, edges, 50, 130);
      const norm = normalizeTo8U(edges);
      const heat = applyJet(norm); // RGBA

      const th = new cv.Mat(); cv.threshold(gray, th, 0, 255, cv.THRESH_BINARY + cv.THRESH_OTSU);
      const contours = new cv.MatVector();
      const hierarchy = new cv.Mat();
      cv.findContours(th, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

      const out = src.clone();
      // blend heatmap and original
      cv.addWeighted(out, 0.6, heat, 0.5, 0, out);

      for (let i = 0; i < contours.size(); i++) {
        const cnt = contours.get(i);
        const rect = cv.boundingRect(cnt);
        // skip tiny regions
        if (rect.width * rect.height < (src.rows * src.cols) * 0.002) {
          cnt.delete();
          continue;
        }
        cv.rectangle(out, new cv.Point(rect.x, rect.y), new cv.Point(rect.x + rect.width, rect.y + rect.height), [0, 255, 0, 255], 3);
        cv.putText(out, "Region", new cv.Point(rect.x, Math.max(10, rect.y - 6)), cv.FONT_HERSHEY_SIMPLEX, 0.6, [0, 220, 0, 255], 2);
        cnt.delete();
      }

      gray.delete(); edges.delete(); norm.delete(); heat.delete(); th.delete(); contours.delete(); hierarchy.delete();
      return out;
    }
  };

  // -----------------------
  // Camera init & switching
  // -----------------------
  async function startCamera() {
    if (stream) {
      stream.getTracks().forEach(t => t.stop());
      stream = null;
    }

    const constraints = {
      video: {
        facingMode: currentFacingMode,
        width: { ideal: 1280 },
        height: { ideal: 720 }
      },
      audio: false
    };

    try {
      stream = await navigator.mediaDevices.getUserMedia(constraints);
      video.srcObject = stream;

      // enumerate devices to decide whether to show switch button
      navigator.mediaDevices.enumerateDevices().then(devices => {
        const videoDevices = devices.filter(d => d.kind === "videoinput");
        const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
        if (videoDevices.length > 1 || isMobile) {
          switchCameraBtn.style.display = "inline-block";
        } else {
          switchCameraBtn.style.display = "none";
        }
      }).catch(e => console.warn("enumerateDevices error:", e));

      video.addEventListener("loadedmetadata", () => {
        canvas.width = video.videoWidth || 640;
        canvas.height = video.videoHeight || 480;
        videoReady = true;
        console.log(`Video ready (${currentFacingMode}):`, canvas.width, "x", canvas.height);
        startIfReady();
      }, { once: true });

    } catch (err) {
      console.error("Camera start failed:", err);
      // Fallback attempt without facingMode (some browsers/devices fail with facingMode constraint)
      if (currentFacingMode === "environment") {
        try {
          stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
          video.srcObject = stream;
        } catch (e) {
          alert("Unable to access camera. Please allow camera access and reload the page.");
        }
      } else {
        alert("Unable to access camera. Please allow camera access and reload the page.");
      }
    }
  }

  // switch camera button handler
  switchCameraBtn.onclick = () => {
    currentFacingMode = currentFacingMode === "environment" ? "user" : "environment";
    videoReady = false;
    startCamera();
  };

  // -----------------------
  // OpenCV readiness & start trigger
  // -----------------------
  function onCvReady() {
    cvReady = true;
    console.log("OpenCV.js runtime initialized");
    startIfReady();
  }

  function startIfReady() {
    if (cvReady && videoReady && !running) {
      running = true;
      requestAnimationFrame(processLoop);
    }
  }

  // -----------------------
  // FPS helper
  // -----------------------
  function showFps() {
    frameCount++;
    const now = performance.now();
    if (now - lastFpsTime >= 1000) {
      const fps = (frameCount * 1000 / (now - lastFpsTime)).toFixed(1);
      fpsLabel.innerText = `FPS: ${fps}`;
      frameCount = 0;
      lastFpsTime = now;
    }
  }

  // -----------------------
  // Main processing loop
  // -----------------------
  function processLoop() {
    if (!cvReady || !videoReady) {
      requestAnimationFrame(processLoop);
      return;
    }

    // adapt canvas size if dynamic
    if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
      canvas.width = video.videoWidth || canvas.width;
      canvas.height = video.videoHeight || canvas.height;
    }

    // draw frame to canvas as source
    try {
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    } catch (err) {
      // drawImage may fail transiently (e.g., mobile browser); skip this frame
      console.warn("drawImage failed:", err);
      requestAnimationFrame(processLoop);
      return;
    }

    // read into OpenCV Mat
    let src = null;
    try {
      src = cv.imread(canvas); // RGBA Mat
    } catch (err) {
      console.warn("cv.imread failed:", err);
      if (src) src.delete();
      requestAnimationFrame(processLoop);
      return;
    }

    let dst = null;
    const mode = modeSelect.value;

    try {
      if (mode === "canny") dst = Modes.canny(src);
      else if (mode === "sobel") dst = Modes.sobel(src);
      else if (mode === "log") dst = Modes.log(src);
      else if (mode === "dog") dst = Modes.dog(src);
      else if (mode === "depth") dst = Modes.depthLike(src); // already RGBA
      else if (mode === "segment") dst = Modes.segment(src); // already RGBA
      else if (mode === "features") {
        const kps = Features.detectORB(src);
        dst = Overlay.drawKeypoints(src, kps);
        // keypoints vector deleted inside drawKeypoints? we created it here so delete it
        try { kps.delete(); } catch (e) {}
      } else if (mode === "ar") {
        dst = Overlay.arOverlayMode(src);
      } else {
        dst = src.clone();
      }
    } catch (err) {
      console.error("Processing error:", err);
      if (dst) { dst.delete(); dst = null; }
      dst = src.clone();
    }

    // show output (convert single-channel to RGBA if needed)
    try {
      if (dst && dst.type && dst.type() === cv.CV_8UC1) {
        const colorOut = new cv.Mat();
        cv.cvtColor(dst, colorOut, cv.COLOR_GRAY2RGBA);
        cv.imshow(canvas, colorOut);
        colorOut.delete();
      } else if (dst) {
        cv.imshow(canvas, dst);
      }
    } catch (err) {
      console.error("cv.imshow error:", err);
    }

    // cleanup
    if (src) src.delete();
    if (dst) dst.delete();

    showFps();
    requestAnimationFrame(processLoop);
  }

  // -----------------------
  // Screenshot handler (robust)
  // -----------------------
  screenshotBtn.addEventListener("click", () => {
    if (!videoReady) {
      alert("Camera is not ready yet. Please wait.");
      return;
    }

    const originalText = screenshotBtn.textContent;
    screenshotBtn.textContent = "Capturing...";
    screenshotBtn.disabled = true;

    // ensure latest frame is drawn
    try { ctx.drawImage(video, 0, 0, canvas.width, canvas.height); } catch (e) { console.warn("drawImage for screenshot:", e); }

    // toBlob ensures a real binary PNG (avoids 0-byte/zip problems)
    canvas.toBlob((blob) => {
      if (!blob) {
        alert("Screenshot failed: canvas not ready.");
        screenshotBtn.textContent = originalText;
        screenshotBtn.disabled = false;
        return;
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `ar_edge_${Date.now()}.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);

      screenshotBtn.textContent = "Saved!";
      setTimeout(() => {
        screenshotBtn.textContent = "Save Screenshot";
        screenshotBtn.disabled = false;
      }, 1200);
    }, "image/png");
  });

  // -----------------------
  // Bind OpenCV readiness
  // -----------------------
  if (typeof cv !== "undefined") {
    // Attach onRuntimeInitialized safely
    if (cv['onRuntimeInitialized'] !== undefined) {
      cv['onRuntimeInitialized'] = () => onCvReady();
    } else {
      // Poll until cv is ready
      const poll = setInterval(() => {
        if (cv && (typeof cv['getBuildInformation'] === 'function')) {
          clearInterval(poll);
          onCvReady();
        }
      }, 200);
    }
  } else {
    console.warn("OpenCV.js not loaded. Check script src in index.html.");
  }

  // start camera now
  startCamera();

  // developer helper
  window.__arEdgeDebug = {
    isCvReady: () => cvReady,
    isVideoReady: () => videoReady,
    isRunning: () => running
  };

})(); // end of IIFE
