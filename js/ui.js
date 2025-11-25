// js/ui.js
(async function () {
  const video = document.getElementById('video');
  const canvas = document.getElementById('canvas');
  const ctx = canvas.getContext('2d');
  const modeSel = document.getElementById('mode');
  const fpsSpan = document.getElementById('fps');
  const screenshotBtn = document.getElementById('screenshot');

  // get webcam
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
    video.srcObject = stream;
  } catch (e) {
    alert('Camera access required: ' + e);
    return;
  }

  let captureScreenshot = false;

  screenshotBtn.onclick = () => {
    // Set flag to capture on next frame render
    captureScreenshot = true;
  };

  function saveScreenshot() {
    try {
      const dataUrl = canvas.toDataURL('image/png');
      const a = document.createElement('a');
      a.href = dataUrl;
      a.download = `ar_edge_${Date.now()}.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      console.log('Screenshot saved successfully');
    } catch (error) {
      console.error('Error saving screenshot:', error);
      alert('Failed to save screenshot: ' + error.message);
    }
  }

  let lastTime = performance.now(), frames = 0;
  function updateFPS() {
    frames++;
    const now = performance.now();
    if (now - lastTime >= 1000) {
      fpsSpan.textContent = 'FPS: ' + frames;
      frames = 0; lastTime = now;
    }
  }

  function processFrame() {
    if (typeof cv === 'undefined') { requestAnimationFrame(processFrame); return; }
    canvas.width = video.videoWidth; canvas.height = video.videoHeight;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    let src = cv.imread(canvas);
    let outMat = null;

    switch (modeSel.value) {
      case 'canny': outMat = Modes.canny(src); break;
      case 'sobel': outMat = Modes.sobel(src); break;
      case 'log': outMat = Modes.log(src); break;
      case 'dog': outMat = Modes.dog(src); break;
      case 'features':
        let kps = Features.detectORB(src);
        outMat = Overlay.drawKeypoints(src, kps);
        kps.delete();
        break;
      case 'depth':
        outMat = Modes.depthLike(src); cv.cvtColor(outMat, outMat, cv.COLOR_GRAY2RGBA); break;
      case 'segment':
        outMat = Modes.segment(src); cv.cvtColor(outMat, outMat, cv.COLOR_GRAY2RGBA); break;
      case 'ar':
        let edges = Modes.canny(src);
        cv.cvtColor(edges, edges, cv.COLOR_GRAY2RGBA);
        outMat = src.clone();
        cv.addWeighted(outMat, 0.7, edges, 0.7, 0, outMat);
        edges.delete();
        break;
      default: outMat = src.clone();
    }

    cv.imshow(canvas, outMat);
    updateFPS();
    src.delete(); outMat.delete();

    // Capture screenshot after frame is rendered
    if (captureScreenshot) {
      captureScreenshot = false;
      // Use setTimeout to ensure canvas is fully updated
      setTimeout(saveScreenshot, 50);
    }

    requestAnimationFrame(processFrame);
  }

  requestAnimationFrame(processFrame);
})();
