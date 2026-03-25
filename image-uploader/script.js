// No third-party client — raw Gradio 5 REST API + EventSource
const SPACE = "https://quirkythings-remembrance-soundscapes.hf.space";

let FAKE_MODE = false;
let selectedFile = null;

// ——————————————————————————
// Image compression
// ——————————————————————————
const MAX_BYTES   = 750 * 1024;   // 750 KB
const MAX_DIM     = 1920;          // longest side
const QUALITIES   = [0.88, 0.80, 0.70, 0.60, 0.50];

async function compressImage(file) {
  if (file.size <= MAX_BYTES) return file;

  const bitmap = await createImageBitmap(file);
  const { width: w, height: h } = bitmap;

  let dw = w, dh = h;
  if (w > MAX_DIM || h > MAX_DIM) {
    const ratio = Math.min(MAX_DIM / w, MAX_DIM / h);
    dw = Math.round(w * ratio);
    dh = Math.round(h * ratio);
  }

  const canvas = document.createElement("canvas");
  canvas.width  = dw;
  canvas.height = dh;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, dw, dh);
  ctx.drawImage(bitmap, 0, 0, dw, dh);
  bitmap.close();

  for (const q of QUALITIES) {
    const blob = await new Promise(res => canvas.toBlob(res, "image/jpeg", q));
    if (blob.size <= MAX_BYTES || q === QUALITIES.at(-1)) {
      const baseName = file.name.replace(/\.[^.]+$/, "") + ".jpg";
      return new File([blob], baseName, { type: "image/jpeg" });
    }
  }
}

// ——————————————————————————
// Resolve Gradio file → URL
// ——————————————————————————
function resolveFileUrl(fileData) {
  if (!fileData) return "";
  if (fileData.url) return fileData.url;
  if (fileData.path) return `${SPACE}/file=${fileData.path}`;
  return "";
}

function syncFakeCheckboxes(value) {
  ["fake-toggle", "fake-toggle-2", "fake-toggle-3"].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.checked = value;
  });
}

function setupFakeModeToggles() {
  ["fake-toggle", "fake-toggle-2", "fake-toggle-3"].forEach(id => {
    document.getElementById(id)?.addEventListener("change", (e) => {
      FAKE_MODE = e.target.checked;
      syncFakeCheckboxes(FAKE_MODE);
    });
  });
}

document.addEventListener("DOMContentLoaded", () => {
  setupFakeModeToggles();

  const screenUpload  = document.getElementById("screen-upload");
  const screenLoading = document.getElementById("screen-loading");
  const screenSuccess = document.getElementById("screen-success");
  const screenError   = document.getElementById("screen-error");

  const fileInput       = document.getElementById("file-input");
  const uploadZone      = document.getElementById("upload-zone");
  const filenameDisplay = document.getElementById("filename-display");
  const btnGenerate     = document.getElementById("btn-generate");
  const btnBack         = document.getElementById("btn-back");
  const btnErrorBack    = document.getElementById("btn-error-back");

  const outputImage  = document.getElementById("output-image");
  const audioPlayer  = document.getElementById("audio-player");
  const metadataLink = document.getElementById("metadata-link");
  const titleText    = document.getElementById("title-text");
  const errorMessage = document.getElementById("error-message");
  const loadingText  = document.getElementById("loading-text");
  const queueStatus  = document.getElementById("queue-status");
  const progressBar  = document.getElementById("progress-bar");

  // ——————————————————————————
  // Screen management
  // ——————————————————————————
  function show(screen) {
    [screenUpload, screenLoading, screenSuccess, screenError]
      .forEach(s => s.classList.remove("active"));
    screen.classList.add("active");
  }

  function reset() {
    selectedFile = null;
    fileInput.value = "";
    filenameDisplay.textContent = "";
    filenameDisplay.classList.remove("visible");
    btnGenerate.disabled = true;
    outputImage.src = "";
    audioPlayer.src = "";
    metadataLink.href = "";
    titleText.textContent = "";
  }

  // ——————————————————————————
  // File selection
  // ——————————————————————————
  async function onFileSelected(file) {
    if (!file) return;
    btnGenerate.disabled = true;
    filenameDisplay.textContent = "Preparing…";
    filenameDisplay.classList.add("visible");

    const originalKB = Math.round(file.size / 1024);
    const compressed = await compressImage(file);
    const compressedKB = Math.round(compressed.size / 1024);

    selectedFile = compressed;

    if (compressed.size < file.size) {
      filenameDisplay.textContent = `${compressed.name}  (${originalKB} KB → ${compressedKB} KB)`;
    } else {
      filenameDisplay.textContent = `${file.name}  (${originalKB} KB)`;
    }

    btnGenerate.disabled = false;
  }

  fileInput.addEventListener("change", () => {
    onFileSelected(fileInput.files?.[0]);
  });

  uploadZone.addEventListener("dragover", (e) => {
    e.preventDefault();
    uploadZone.classList.add("dragover");
  });

  uploadZone.addEventListener("dragleave", () => {
    uploadZone.classList.remove("dragover");
  });

  uploadZone.addEventListener("drop", (e) => {
    e.preventDefault();
    uploadZone.classList.remove("dragover");
    const file = e.dataTransfer?.files?.[0];
    if (file && file.type.startsWith("image/")) onFileSelected(file);
  });

  // ——————————————————————————
  // Metadata extraction
  // ——————————————————————————
  async function extractTitleFromMetadata(url) {
    try {
      const text = await fetch(url).then(r => r.text());
      const match = text.match(/^TITLE:\s*(.+)$/m);
      return match ? match[1].trim() : "Untitled Soundscape";
    } catch {
      return "Untitled Soundscape";
    }
  }

  // ——————————————————————————
  // Fake mode
  // ——————————————————————————
  async function runFakeMode(file) {
    await new Promise(res => setTimeout(res, 1200));
    outputImage.src = URL.createObjectURL(file);
    titleText.textContent = "Generated Soundscape";
    audioPlayer.src = "fake/fake-audio.mp3";
    metadataLink.href = "fake/fake-metadata.txt";
    show(screenSuccess);
  }

  // ——————————————————————————
  // Generate
  // ——————————————————————————
  btnGenerate.addEventListener("click", async () => {
    const file = selectedFile;
    if (!file) return;

    show(screenLoading);
    if (FAKE_MODE) return runFakeMode(file);

    let processingStart = null;
    let elapsedTimer = null;

    function startElapsedTimer() {
      processingStart = Date.now();
      elapsedTimer = setInterval(() => {
        const elapsed = Math.floor((Date.now() - processingStart) / 1000);
        const mins = Math.floor(elapsed / 60);
        const secs = elapsed % 60;
        const elapsedStr = mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
        const span = document.getElementById("elapsed-span");
        if (span) {
          span.textContent = elapsedStr;
        } else {
          loadingText.innerHTML = `Listening to your image.<br>Translating memory into sound.<br><span style="opacity:0.5">${elapsedStr}</span>`;
        }
      }, 1000);
    }

    function stopElapsedTimer() {
      if (elapsedTimer) { clearInterval(elapsedTimer); elapsedTimer = null; }
    }

    try {
      // ── Step 1: upload file ──
      loadingText.innerHTML = "Uploading image…";
      queueStatus.textContent = "";
      progressBar.classList.remove("active");

      console.log("[uploader] Uploading to", SPACE);
      const fd = new FormData();
      fd.append("files", file);
      const upRes = await fetch(`${SPACE}/upload`, { method: "POST", body: fd });
      if (!upRes.ok) throw new Error(`Upload failed (${upRes.status}): ${await upRes.text()}`);
      const uploadedPaths = await upRes.json();
      const uploadedPath = uploadedPaths[0];
      console.log("[uploader] Uploaded:", uploadedPath);

      // ── Step 2: submit job ──
      loadingText.innerHTML = "Submitting to queue…";

      const subRes = await fetch(`${SPACE}/call/pipeline_from_image`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          data: [{
            path: uploadedPath,
            orig_name: file.name,
            mime_type: file.type,
            meta: { "_type": "gradio.FileData" }
          }]
        })
      });
      if (!subRes.ok) throw new Error(`Submit failed (${subRes.status}): ${await subRes.text()}`);
      const { event_id } = await subRes.json();
      console.log("[uploader] event_id:", event_id);

      // ── Step 3: stream results via SSE ──
      const resultData = await new Promise((resolve, reject) => {
        const es = new EventSource(`${SPACE}/call/pipeline_from_image/${event_id}`);

        es.addEventListener("heartbeat", () => {
          console.log("[uploader] heartbeat");
          if (!processingStart) {
            loadingText.innerHTML = "Your image is in the queue.<br>Sound will begin soon.";
          }
        });

        ["estimation", "queue_position"].forEach(evName => {
          es.addEventListener(evName, (e) => {
            try {
              const d = JSON.parse(e.data);
              console.log(`[uploader] ${evName}:`, d);
              const pos = d.queue_size ?? d.rank ?? d.position;
              if (pos != null) {
                queueStatus.textContent = pos === 0
                  ? "Next in line"
                  : `${pos} ${pos === 1 ? "person" : "people"} ahead of you`;
              }
              loadingText.innerHTML = "Your image is in the queue.<br>Sound will begin soon.";
              progressBar.classList.remove("active");
            } catch {}
          });
        });

        ["process_starts", "process_generating", "generating"].forEach(evName => {
          es.addEventListener(evName, (e) => {
            console.log(`[uploader] ${evName}`);
            queueStatus.textContent = "";
            if (!processingStart) startElapsedTimer();
            progressBar.classList.add("active");
            loadingText.innerHTML = `Listening to your image.<br>Translating memory into sound.<br><span style="opacity:0.5" id="elapsed-span"></span>`;
          });
        });

        ["complete", "process_completed"].forEach(evName => {
          es.addEventListener(evName, (e) => {
            console.log(`[uploader] ${evName}:`, e.data?.slice(0, 300));
            es.close();
            try {
              const d = JSON.parse(e.data);
              // Gradio 5 /call/ returns array directly: [audioFile, metaFile]
              if (Array.isArray(d)) { resolve(d); return; }
              if (d.output?.data) { resolve(d.output.data); return; }
              if (d.data) { resolve(d.data); return; }
              reject(new Error("Unrecognised completion format"));
            } catch (err) {
              reject(err);
            }
          });
        });

        ["error", "process_error"].forEach(evName => {
          es.addEventListener(evName, (e) => {
            es.close();
            console.error(`[uploader] ${evName}:`, e.data);
            try {
              const d = JSON.parse(e.data);
              reject(new Error(d.message || d.error || "Server error"));
            } catch {
              reject(new Error("Server error"));
            }
          });
        });

        // Catch-all for unnamed SSE messages
        es.onmessage = (e) => {
          console.log("[uploader] onmessage:", e.data?.slice(0, 300));
          try {
            const d = JSON.parse(e.data);
            if (d.error) { es.close(); reject(new Error(d.error)); return; }
            if (Array.isArray(d)) { es.close(); resolve(d); return; }
            if (d.output?.data && !d.is_generating) { es.close(); resolve(d.output.data); return; }
          } catch {}
        };

        es.onerror = (e) => {
          console.error("[uploader] EventSource error:", e);
          es.close();
          reject(new Error("Lost connection to server — check the Space logs."));
        };
      });

      stopElapsedTimer();

      if (!resultData || resultData.length < 2) {
        throw new Error("No result returned — the pipeline may have timed out or crashed.");
      }

      const [audioRes, metaRes] = resultData;
      const audioUrl    = resolveFileUrl(audioRes);
      const metadataUrl = resolveFileUrl(metaRes);

      outputImage.src   = URL.createObjectURL(file);
      audioPlayer.src   = audioUrl;
      metadataLink.href = metadataUrl;

      const parsedTitle = await extractTitleFromMetadata(metadataUrl);
      titleText.textContent = parsedTitle;

      show(screenSuccess);
    } catch (err) {
      stopElapsedTimer();
      console.error("Generation failed", err);
      errorMessage.textContent = err?.message || "Unknown error";
      show(screenError);
    }
  });

  btnBack.addEventListener("click", () => { reset(); show(screenUpload); });
  btnErrorBack.addEventListener("click", () => { reset(); show(screenUpload); });
});
