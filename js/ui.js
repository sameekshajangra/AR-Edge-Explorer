// js/ui.js (robust, copy-paste replacement)
// Works with index.html elements:
//  video id="videoInput"
//  canvas id="canvasOutput"
//  select id="modeSelect"
//  button id="screenshotBtn"
//  span id="fpsLabel"

(() => {
  const video = document.getElementById("videoInput");
  const canvas = document.getElementById("canvasOutput");
  const ctx = canvas.getContext("2d");
  const modeSelect = document.getElementById("modeSelect");
  const screenshotBtn = document.getElementById("screenshotBtn");
  const fpsLabel = document.getElementById("fpsLabel");

  let cvReady = false;
  let videoReady = false;
  let running = false;
  let lastFpsTime = performance.now();
  let frameCount = 0;

  // Start camera
  async function startCamera() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 1280, height: 720 }, audio: false });
      video.srcObject = stream;

      // wait until metadata (size) is available
      video.addEventListener("loadedmetadata", () => {
        // set canvas to video size (important)
        canvas.width = video.videoWidth || 640;
        canvas.height = video.videoHeight || 480;
        videoReady = true;
        console.log("Video ready:", canvas.width, "x", canvas.height);
        startIfReady();
      });
    } catch (err) {
      console.error("Camera start failed:", err);
      alert("Unable to access camera. Please allow camera access and reload the page.");
    }
  }

  // OpenCV readiness
  function onCvReady() {
    cvReady = true;
    console.log("OpenCV.js runtime initialized");
    startIfReady();
  }

  // Helper: start processing only when both video and cv are ready
  function startIfReady() {
    if (cvReady && videoReady && !running) {
      running = true;
      requestAnimationFrame(processLoop);
    }
  }

  // Safe read of canvas into OpenCV Mat
  function readSrcMat() {
    try {
      return cv.imread(canvas);
    } catch (e) {
      // fallback: create mat from video frame if imread fails
      const tmp = new cv.Mat(video.videoHeight, video.videoWidth, cv.CV_8UC4);
      cv.cvtColor(tmp, tmp, cv.COLOR_RGBA2RGB); // small no-op to keep consistent
      return tmp;
    }
  }

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

  // Main processing loop
  function processLoop() {
    if (!cvReady || !videoReady) {
      requestAnimationFrame(processLoop);
      return;
    }

    // ensure canvas size = video size (in case of dynamic change)
    if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
      canvas.width = video.videoWidth || canvas.width;
      canvas.height = video.videoHeight || canvas.height;
    }

    // draw latest video frame onto canvas (source for cv.imread)
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    // Now read into OpenCV
    let src = null;
    try {
      src = cv.imread(canvas); // RGBA Mat
    } catch (err) {
      console.warn("cv.imread failed, skipping frame:", err);
      if (src) src.delete();
      requestAnimationFrame(processLoop);
      return;
    }

    let dst = null;
    const mode = modeSelect.value;

    try {
      // Call functions defined in your other js files (modes.js/features.js/etc.)
      if (mode === "canny") dst = cannyMode(src);
      else if (mode === "sobel") dst = sobelMode(src);
      else if (mode === "log") dst = logMode(src);
      else if (mode === "dog") dst = dogMode(src);
      else if (mode === "depth") dst = depthMode(src);
      else if (mode === "segment") dst = segmentMode(src);
      else if (mode === "features") dst = featureMode(src);
      else if (mode === "ar") dst = arOverlayMode(src);
      else dst = src.clone();
    } catch (err) {
      console.error("Processing error:", err);
      if (dst) { dst.delete(); dst = null; }
      dst = src.clone();
    }

    // Display
    try {
      // If dst is single-channel, convert to RGBA for consistent display
      if (dst && dst.type() === cv.CV_8UC1) {
        let colorOut = new cv.Mat();
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

  // Screenshot handler (robust)
  screenshotBtn.addEventListener("click", () => {
    // ensure canvas has current video frame before saving
    try {
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    } catch (e) {
      console.warn("drawImage before screenshot failed:", e);
    }

    // use toBlob for reliable binary output
    canvas.toBlob((blob) => {
      if (!blob) {
        alert("Screenshot failed: canvas not ready.");
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
    }, "image/png");
  });

  // Bind OpenCV init hook
  if (typeof cv !== "undefined") {
    if (cv['onRuntimeInitialized']) {
      // Some pages set onRuntimeInitialized before cv is ready; ensure we attach
      cv['onRuntimeInitialized'] = () => {
        onCvReady();
      };
    } else {
      // fallback: poll cv until ready
      const poll = setInterval(() => {
        if (cv && cv['onRuntimeInitialized']) {
          clearInterval(poll);
          cv['onRuntimeInitialized'] = () => onCvReady();
        } else if (cv && typeof cv['getBuildInformation'] === 'function') {
          // already ready
          clearInterval(poll);
          onCvReady();
        }
      }, 200);
    }
  } else {
    console.warn("OpenCV.js not found on page; ensure script src is correct.");
  }

  // Start camera immediately (will set videoReady when metadata available)
  startCamera();

  // Developer helper: expose debug function
  window.__arEdgeDebug = {
    isCvReady: () => cvReady,
    isVideoReady: () => videoReady,
    isRunning: () => running
  };

})();
