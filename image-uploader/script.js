import { Client } from "https://cdn.jsdelivr.net/npm/@gradio/client/dist/index.min.js";

let FAKE_MODE = false;
let selectedFile = null;

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
  function onFileSelected(file) {
    if (!file) return;
    selectedFile = file;
    filenameDisplay.textContent = file.name;
    filenameDisplay.classList.add("visible");
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

    try {
      const HF_SPACE = "Hope-and-Despair/Stable-Audio-freestyle-new-experiments";
      const client = await Client.connect(HF_SPACE);
      const job = client.submit("/pipeline_from_image", [file]);

      let audioRes, metaRes;
      for await (const msg of job) {
        if (msg.type === "status") {
          const s = msg.data;
          if (s.status === "in_queue" && s.position != null) {
            const pos = s.position;
            queueStatus.textContent = pos === 0 ? "Next in line" : `${pos} ${pos === 1 ? "person" : "people"} ahead of you`;
            loadingText.innerHTML = "Your image is in the queue.<br>Sound will begin soon.";
          } else {
            queueStatus.textContent = "";
            loadingText.innerHTML = "Listening to your image.<br>Translating memory into sound.";
          }
        } else if (msg.type === "data") {
          [audioRes, metaRes] = msg.data;
        }
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
      console.error("Generation failed", err);
      errorMessage.textContent = err?.message || "Unknown error";
      show(screenError);
    }
  });

  btnBack.addEventListener("click", () => { reset(); show(screenUpload); });
  btnErrorBack.addEventListener("click", () => { reset(); show(screenUpload); });
});
