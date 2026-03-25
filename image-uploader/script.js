import { Client } from "https://cdn.jsdelivr.net/npm/@gradio/client/dist/index.min.js";

let FAKE_MODE = false;
let selectedFile = null;

// ——————————————————————————
// Image compression
// ——————————————————————————
const MAX_BYTES   = 750 * 1024;   // 750 KB
const MAX_DIM     = 1920;          // longest side
const QUALITIES   = [0.88, 0.80, 0.70, 0.60, 0.50];

async function compressImage(file) {
  // Skip tiny files
  if (file.size <= MAX_BYTES) return file;

  const bitmap = await createImageBitmap(file);
  const { width: w, height: h } = bitmap;

  // Scale down if needed
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
  // White background for images with transparency
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, dw, dh);
  ctx.drawImage(bitmap, 0, 0, dw, dh);
  bitmap.close();

  // Try qualities until we fit
  for (const q of QUALITIES) {
    const blob = await new Promise(res => canvas.toBlob(res, "image/jpeg", q));
    if (blob.size <= MAX_BYTES || q === QUALITIES.at(-1)) {
      const baseName = file.name.replace(/\.[^.]+$/, "") + ".jpg";
      return new File([blob], baseName, { type: "image/jpeg" });
    }
  }
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

  const fileInput      = document.getElementById("file-input");
  const uploadZone     = document.getElementById("upload-zone");
  const filenameDisplay = document.getElementById("filename-display");
  const btnGenerate    = document.getElementById("btn-generate");
  const btnBack        = document.getElementById("btn-back");
  const btnErrorBack   = document.getElementById("btn-error-back");

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

  // Drag-and-drop
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
      const HF_SPACE = "quirkythings/remembrance-soundscapes";
      const client = await Client.connect(HF_SPACE);
      const job = client.submit("/pipeline_from_image", [file]);

      let audioRes, metaRes;

      for await (const msg of job) {
        if (msg.type === "status") {
          const s = msg.data;
          if (s.status === "in_queue" && s.position != null) {
            stopElapsedTimer();
            const pos = s.position;
            queueStatus.textContent = pos === 0 ? "Next in line" : `${pos} ${pos === 1 ? "person" : "people"} ahead of you`;
            if (s.eta != null && s.eta > 0) {
              const mins = Math.floor(s.eta / 60);
              const secs = Math.round(s.eta % 60);
              const etaStr = mins > 0 ? `~${mins}m ${secs}s` : `~${secs}s`;
              loadingText.innerHTML = `Your image is in the queue.<br>Expected wait: ${etaStr}.`;
            } else {
              loadingText.innerHTML = "Your image is in the queue.<br>Sound will begin soon.";
            }
            progressBar.classList.remove("active");
          } else {
            queueStatus.textContent = "";
            if (!processingStart) startElapsedTimer();
            progressBar.classList.add("active");
            // Show phase description from gr.Progress if available
            const phase = s.progress_data?.[0]?.desc;
            if (phase) {
              loadingText.innerHTML = `${phase}<br><span style="opacity:0.5" id="elapsed-span"></span>`;
            }
          }
        } else if (msg.type === "error") {
          throw new Error(msg.message || msg.data?.message || "Server error");
        } else if (msg.type === "data") {
          [audioRes, metaRes] = msg.data;
          stopElapsedTimer();
          break;
        }
      }
      stopElapsedTimer();

      if (!audioRes && !metaRes) {
        throw new Error("No result returned — the pipeline may have timed out or crashed. Check the Space logs.");
      }

      const audioUrl    = audioRes?.url || audioRes?.path || "";
      const metadataUrl = metaRes?.url  || metaRes?.path  || "";

      outputImage.src    = URL.createObjectURL(file);
      audioPlayer.src    = audioUrl;
      metadataLink.href  = metadataUrl;

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
