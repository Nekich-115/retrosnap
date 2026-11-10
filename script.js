"use strict";

const fileInput = document.getElementById("fileInput");
const welcomeScreen = document.getElementById("welcomeScreen");
const editorScreen = document.getElementById("editorScreen");
const changeFileButton = document.getElementById("changeFileButton");
const canvas = document.getElementById("editorCanvas");
const ctx = canvas.getContext("2d", { willReadFrequently: true });
const sourceVideo = document.getElementById("sourceVideo");
const videoControls = document.getElementById("videoControls");
const playButton = document.getElementById("playButton");
const muteButton = document.getElementById("muteButton");
const videoSeek = document.getElementById("videoSeek");
const videoTime = document.getElementById("videoTime");
const downloadButton = document.getElementById("downloadButton");
const resetButton = document.getElementById("resetButton");
const presetGrid = document.getElementById("presetGrid");
const intensitySlider = document.getElementById("intensity");
const intensityValue = document.getElementById("intensityValue");
const fileName = document.getElementById("fileName");
const exportNote = document.getElementById("exportNote");
const emptyPreview = document.getElementById("emptyPreview");

const originalCanvas = document.createElement("canvas");
const originalCtx = originalCanvas.getContext("2d", { willReadFrequently: true });

const processedCanvas = document.createElement("canvas");
const processedCtx = processedCanvas.getContext("2d", { willReadFrequently: true });

let currentImage = null;
let currentFile = null;
let currentType = null;
let currentPreset = "vhs";
let intensity = 1;
let animationFrame = null;
let lastVideoRender = 0;
let exporting = false;
let mediaRecorder = null;
let recordedChunks = [];
let videoObjectURL = null;

const MAX_DIMENSION = 1800;

function clamp(value, min = 0, max = 255) {
    return Math.max(min, Math.min(max, value));
}

function randomBetween(min, max) {
    return min + Math.random() * (max - min);
}

function setCanvasSize(width, height) {
    const scale = Math.min(1, MAX_DIMENSION / Math.max(width, height));
    const w = Math.max(1, Math.round(width * scale));
    const h = Math.max(1, Math.round(height * scale));

    canvas.width = w;
    canvas.height = h;

    originalCanvas.width = w;
    originalCanvas.height = h;

    processedCanvas.width = w;
    processedCanvas.height = h;
}

function showEditor() {
    welcomeScreen.classList.add("hidden");
    editorScreen.classList.remove("hidden");
    emptyPreview.classList.add("hidden");
}

function stopVideoLoop() {
    if (animationFrame) {
        cancelAnimationFrame(animationFrame);
        animationFrame = null;
    }
}

function clearCurrentFile() {
    stopVideoLoop();
    sourceVideo.pause();
    sourceVideo.removeAttribute("src");
    sourceVideo.load();

    if (videoObjectURL) {
        URL.revokeObjectURL(videoObjectURL);
        videoObjectURL = null;
    }
    currentImage = null;
    currentFile = null;
    currentType = null;
    videoControls.classList.add("hidden");
}

function loadFile(file) {
    if (!file) return;

    if (!file.type.startsWith("image/") && !file.type.startsWith("video/")) {
        alert("Выберите изображение или видео.");
        return;
    }

    clearCurrentFile();
    currentFile = file;
    fileName.textContent = file.name;

    const objectURL = URL.createObjectURL(file);

    if (file.type.startsWith("image/")) {
        const image = new Image();
        image.onload = () => {
            currentImage = image;
            currentType = "image";
            setCanvasSize(image.naturalWidth, image.naturalHeight);
            originalCtx.clearRect(0, 0, originalCanvas.width, originalCanvas.height);
            originalCtx.drawImage(image, 0, 0, originalCanvas.width, originalCanvas.height);
            showEditor();
            renderImage();
            URL.revokeObjectURL(objectURL);
        };
        image.onerror = () => {
            URL.revokeObjectURL(objectURL);
            alert("Не удалось открыть изображение.");
        };
        image.src = objectURL;
        return;
    }

    currentType = "video";
    videoObjectURL = objectURL;
    sourceVideo.src = objectURL;
    sourceVideo.muted = true;

    sourceVideo.onloadedmetadata = () => {
        setCanvasSize(sourceVideo.videoWidth, sourceVideo.videoHeight);
        videoControls.classList.remove("hidden");
        showEditor();
        sourceVideo.currentTime = 0;

        sourceVideo.onseeked = () => {
            renderVideoFrame();
            startVideoLoop();
            sourceVideo.play().catch(() => { playButton.textContent = "▶"; });
            sourceVideo.onseeked = null;
        };
    };
    sourceVideo.onerror = () => alert("Не удалось открыть видео.");
}

function renderImage() {
    if (!currentImage) return;
    processFrame(originalCanvas, canvas, currentPreset, intensity);
}

function renderVideoFrame() {
    if (!sourceVideo.videoWidth) return;
    originalCtx.clearRect(0, 0, originalCanvas.width, originalCanvas.height);
    originalCtx.drawImage(sourceVideo, 0, 0, originalCanvas.width, originalCanvas.height);
    processFrame(originalCanvas, canvas, currentPreset, intensity);
    updateVideoTime();
}

function startVideoLoop() {
    stopVideoLoop();
    const loop = (timestamp) => {
        if (currentType !== "video" || sourceVideo.paused || sourceVideo.ended) {
            animationFrame = null;
            return;
        }
        if (timestamp - lastVideoRender > 65) {
            renderVideoFrame();
            lastVideoRender = timestamp;
        }
        animationFrame = requestAnimationFrame(loop);
    };
    animationFrame = requestAnimationFrame(loop);
}

function processFrame(source, output, preset, amount) {
    const width = source.width;
    const height = source.height;

    processedCtx.clearRect(0, 0, width, height);
    processedCtx.drawImage(source, 0, 0);

    const image = processedCtx.getImageData(0, 0, width, height);
    const data = image.data;

    for (let i = 0; i < data.length; i += 4) {
        const originalR = data[i];
        const originalG = data[i + 1];
        const originalB = data[i + 2];

        let r = originalR;
        let g = originalG;
        let b = originalB;

        switch (preset) {
            case "vhs":
                r = r * 1.12 + 7; g = g * 0.96; b = b * 1.16 + 5;
                break;
            case "polaroid":
                r = r * 0.94 + 22; g = g * 0.91 + 17; b = b * 0.82 + 13;
                break;
            case "club":
                r = r * 1.3 + 17; g = g * 1.19 + 12; b = b * 1.12 + 10;
                break;
            case "camcorder":
                r = r * 0.84; g = g * 1.1 + 12; b = b * 0.78 + 3;
                break;
            case "y2k": {
                const gray = 0.299 * r + 0.587 * g + 0.114 * b;
                const contrast = (gray - 128) * 1.9 + 128;
                r = g = b = contrast;
                break;
            }
            case "comic":
                r = Math.round(r / 64) * 64; g = Math.round(g / 64) * 64; b = Math.round(b / 64) * 64;
                break;
            case "90s-film":
                r = r * 1.12 + 13; g = g * 1.08 + 16; b = b * 0.78 + 2;
                r = (r - 118) * 1.12 + 118; g = (g - 118) * 1.10 + 118; b = (b - 118) * 1.08 + 118;
                break;
            case "g7x":
                r = r * 1.04 + 8; g = g * 1.02 + 5; b = b * 0.96 + 2;
                break;
            case "glitch":
                r = r * 1.14; g = g * 0.95; b = b * 1.2;
                break;
        }

        const noiseAmount = { vhs: 25, polaroid: 10, club: 5, camcorder: 15, y2k: 48, comic: 0, "90s-film": 22, g7x: 3, glitch: 20, custom: 0 }[preset] || 0;
        const noise = (Math.random() - 0.5) * noiseAmount;

        r = clamp(r + noise); g = clamp(g + noise); b = clamp(b + noise);

        data[i] = originalR + (r - originalR) * amount;
        data[i + 1] = originalG + (g - originalG) * amount;
        data[i + 2] = originalB + (b - originalB) * amount;
    }

    processedCtx.putImageData(image, 0, 0);

    const outputCtx = output.getContext("2d");
    outputCtx.clearRect(0, 0, width, height);
    outputCtx.drawImage(processedCanvas, 0, 0);

    applyOverlay(outputCtx, width, height, preset, amount);

    if (amount === 0) {
        outputCtx.clearRect(0, 0, width, height);
        outputCtx.drawImage(source, 0, 0);
    }
    
    drawWatermark(outputCtx, width, height);
}

function drawWatermark(ctx, width, height) {
    ctx.save();
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 0.65;
    const fontSize = Math.max(18, width * 0.04);
    ctx.font = `bold ${fontSize}px sans-serif`;
    ctx.fillStyle = "#ffffff";
    ctx.textAlign = "right";
    ctx.textBaseline = "bottom";
    ctx.shadowColor = "rgba(0,0,0,0.8)";
    ctx.shadowBlur = 4;
    ctx.fillText("RetroSnap Studio", width - 15, height - 15);
    ctx.restore();
}

function addVignette(ctx, width, height, strength) {
    const gradient = ctx.createRadialGradient(width / 2, height / 2, Math.min(width, height) * 0.15, width / 2, height / 2, Math.max(width, height) * 0.72);
    gradient.addColorStop(0, "rgba(0,0,0,0)");
    gradient.addColorStop(1, `rgba(0,0,0,${strength})`);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);
}

function addScanlines(ctx, width, height, opacity) {
    ctx.save();
    ctx.fillStyle = `rgba(0,0,0,${opacity})`;
    for (let y = 0; y < height; y += 4) ctx.fillRect(0, y, width, 1);
    ctx.restore();
}

function addChromatic(ctx, width, height, amount) {
    const copy = document.createElement("canvas");
    copy.width = width; copy.height = height;
    copy.getContext("2d").drawImage(canvas, 0, 0);
    ctx.save();
    ctx.globalCompositeOperation = "screen";
    ctx.globalAlpha = 0.28;
    ctx.drawImage(copy, -amount, 0);
    ctx.drawImage(copy, amount, 0);
    ctx.restore();
}

function addTimestamp(ctx, width, height, text) {
    ctx.save();
    ctx.font = `bold ${Math.max(12, width * 0.025)}px monospace`;
    ctx.fillStyle = "#ff574d";
    ctx.shadowColor = "#000";
    ctx.shadowBlur = 4;
    ctx.fillText(text, width * 0.045, height * 0.94);
    ctx.restore();
}

function addHalftone(ctx, width, height) {
    ctx.save();
    ctx.fillStyle = "rgba(0,0,0,0.35)";
    const spacing = Math.max(6, Math.round(width / 130));
    for (let y = 0; y < height; y += spacing) {
        for (let x = 0; x < width; x += spacing) {
            ctx.beginPath(); ctx.arc(x, y, spacing * 0.16, 0, Math.PI * 2); ctx.fill();
        }
    }
    ctx.restore();
}

function addPolaroid(ctx, width, height) {
    const bottom = height * 0.17;
    ctx.save();
    ctx.fillStyle = "#f6f0e4";
    ctx.fillRect(0, height - bottom, width, bottom);
    ctx.fillStyle = "#65594d";
    ctx.textAlign = "center";
    ctx.font = `italic ${Math.max(15, width * 0.035)}px Georgia`;
    ctx.fillText("Summer '16", width / 2, height - bottom * 0.38);
    ctx.restore();
}

function applyOverlay(ctx, width, height, preset, amount) {
    if (amount <= 0) return;
    ctx.save();
    ctx.globalAlpha = amount;

    switch (preset) {
        case "vhs":
            addChromatic(ctx, width, height, Math.max(2, width * 0.004));
            addScanlines(ctx, width, height, 0.17);
            addTimestamp(ctx, width, height, "PLAY 00:16:24");
            addVignette(ctx, width, height, 0.24);
            break;
        case "polaroid":
            addVignette(ctx, width, height, 0.12);
            addPolaroid(ctx, width, height);
            break;
        case "club": {
            addVignette(ctx, width, height, 0.78);
            const flash = ctx.createRadialGradient(width / 2, height / 2, 0, width / 2, height / 2, width * 0.52);
            flash.addColorStop(0, "rgba(255,255,255,0.42)");
            flash.addColorStop(1, "rgba(255,255,255,0)");
            ctx.fillStyle = flash;
            ctx.fillRect(0, 0, width, height);
            break;
        }
        case "camcorder":
            addScanlines(ctx, width, height, 0.23);
            addVignette(ctx, width, height, 0.32);
            ctx.fillStyle = "#ff453a";
            ctx.font = `bold ${Math.max(13, width * 0.025)}px monospace`;
            ctx.fillText("● REC", width * 0.05, height * 0.09);
            ctx.fillStyle = "#fff";
            ctx.fillText("▶ SP", width * 0.05, height * 0.14);
            addTimestamp(ctx, width, height, "00:12:08");
            break;
        case "y2k": {
            addVignette(ctx, width, height, 0.3);
            const gradient = ctx.createLinearGradient(0, 0, width, height);
            gradient.addColorStop(0, "rgba(255,0,180,0.22)");
            gradient.addColorStop(0.5, "rgba(0,255,255,0.14)");
            gradient.addColorStop(1, "rgba(150,0,255,0.25)");
            ctx.fillStyle = gradient;
            ctx.fillRect(0, 0, width, height);
            break;
        }
        case "comic":
            addHalftone(ctx, width, height);
            break;
        case "90s-film": {
            const flash = ctx.createRadialGradient(width * 0.5, height * 0.43, 0, width * 0.5, height * 0.43, Math.max(width, height) * 0.68);
            flash.addColorStop(0, "rgba(255,255,245,0.72)");
            flash.addColorStop(0.16, "rgba(255,255,240,0.48)");
            flash.addColorStop(0.42, "rgba(255,250,225,0.16)");
            flash.addColorStop(1, "rgba(255,255,255,0)");
            ctx.fillStyle = flash;
            ctx.fillRect(0, 0, width, height);

            const vignette = ctx.createRadialGradient(width * 0.5, height * 0.46, Math.min(width, height) * 0.12, width * 0.5, height * 0.46, Math.max(width, height) * 0.68);
            vignette.addColorStop(0, "rgba(0,0,0,0)");
            vignette.addColorStop(0.48, "rgba(0,0,0,0.08)");
            vignette.addColorStop(0.75, "rgba(0,0,0,0.48)");
            vignette.addColorStop(1, "rgba(0,0,0,0.88)");
            ctx.fillStyle = vignette;
            ctx.fillRect(0, 0, width, height);

            ctx.save();
            const dateSize = Math.max(15, width * 0.032);
            ctx.font = `bold ${dateSize}px monospace`;
            ctx.textAlign = "right";
            ctx.textBaseline = "bottom";
            ctx.shadowColor = "rgba(0,0,0,0.65)";
            ctx.shadowBlur = 3;
            ctx.fillStyle = "#ff9b43";
            ctx.fillText("24 12 '98", width * 0.95, height * 0.95);
            ctx.restore();
            break;
        }
        case "g7x": {
            addVignette(ctx, width, height, 0.12);
            const gloss = ctx.createLinearGradient(0, 0, width, height);
            gloss.addColorStop(0, "rgba(255,220,190,0.18)");
            gloss.addColorStop(0.5, "rgba(255,255,255,0)");
            gloss.addColorStop(1, "rgba(255,190,150,0.09)");
            ctx.fillStyle = gloss;
            ctx.fillRect(0, 0, width, height);
            break;
        }
        case "glitch":
            addChromatic(ctx, width, height, Math.max(3, width * 0.009));
            for (let i = 0; i < 8; i++) {
                const y = Math.floor(randomBetween(0, height - 2));
                const h = Math.min(2 + Math.floor(Math.random() * 14), height - y);
                const shift = randomBetween(-width * 0.07, width * 0.07);
                const strip = ctx.getImageData(0, y, width, h);
                ctx.putImageData(strip, shift, y);
            }
            break;
        case "custom":
            ctx.strokeStyle = "#fff";
            ctx.lineWidth = Math.max(5, width * 0.012);
            ctx.strokeRect(width * 0.025, height * 0.025, width * 0.95, height * 0.95);
            ctx.fillStyle = "#050505";
            ctx.fillRect(0, height * 0.88, width, height * 0.12);
            ctx.fillStyle = "#fff";
            ctx.textAlign = "center";
            ctx.font = `bold ${Math.max(16, width * 0.04)}px sans-serif`;
            ctx.fillText("CUSTOM", width / 2, height * 0.955);
            break;
    }
    ctx.restore();
}

function selectPreset(preset) {
    currentPreset = preset;
    document.querySelectorAll(".preset-card").forEach(card => {
        card.classList.toggle("active", card.dataset.preset === preset);
    });
    refreshPreview();
}

function refreshPreview() {
    if (currentType === "image") renderImage();
    else if (currentType === "video") renderVideoFrame();
}

function updateVideoTime() {
    const current = sourceVideo.currentTime || 0;
    const duration = sourceVideo.duration || 0;
    videoTime.textContent = `${formatTime(current)} / ${formatTime(duration)}`;
    if (duration) videoSeek.value = (current / duration) * 100;
}

function formatTime(seconds) {
    if (!Number.isFinite(seconds)) return "00:00";
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

// --- ОБРАБОТЧИКИ СОБЫТИЙ ---

fileInput.addEventListener("change", (event) => {
    const file = event.target.files?.[0];
    if (file) loadFile(file);
    fileInput.value = "";
});

changeFileButton.addEventListener("click", () => {
    clearCurrentFile();
    editorScreen.classList.add("hidden");
    welcomeScreen.classList.remove("hidden");
});

presetGrid.addEventListener("click", (event) => {
    const card = event.target.closest("[data-preset]");
    if (!card) return;
    selectPreset(card.dataset.preset);
});

intensitySlider.addEventListener("input", () => {
    intensity = Number(intensitySlider.value) / 100;
    intensityValue.value = `${intensitySlider.value}%`;
    refreshPreview();
});

resetButton.addEventListener("click", () => {
    intensitySlider.value = 100;
    intensity = 1;
    intensityValue.value = "100%";
    selectPreset("vhs");
});

playButton.addEventListener("click", async () => {
    if (sourceVideo.paused) {
        try {
            await sourceVideo.play();
            playButton.textContent = "Ⅱ";
            startVideoLoop();
        } catch (error) { console.error(error); }
    } else {
        sourceVideo.pause();
        playButton.textContent = "▶";
        stopVideoLoop();
        renderVideoFrame();
    }
});

sourceVideo.addEventListener("ended", () => {
    playButton.textContent = "▶";
    stopVideoLoop();
    renderVideoFrame();
});

muteButton.addEventListener("click", () => {
    sourceVideo.muted = !sourceVideo.muted;
    muteButton.textContent = sourceVideo.muted ? "Звук выкл." : "Звук вкл.";
});

videoSeek.addEventListener("input", () => {
    if (!sourceVideo.duration) return;
    sourceVideo.currentTime = (Number(videoSeek.value) / 100) * sourceVideo.duration;
});

downloadButton.addEventListener("click", async () => {
    if (!currentFile) { alert("Сначала загрузите файл."); return; }
    if (currentType === "image") {
        canvas.toBlob((blob) => {
            if (!blob) return;
            downloadBlob(blob, "retrosnap-photo.png");
        }, "image/png");
        return;
    }
    await exportVideo();
});

function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
}

async function exportVideo() {
    if (!canvas.captureStream || !window.MediaRecorder) {
        exportNote.textContent = "Экспорт видео не поддерживается браузером.";
        return;
    }
    if (exporting) return;
    exporting = true;
    recordedChunks = [];
    const wasPlaying = !sourceVideo.paused;
    const previousTime = sourceVideo.currentTime;
    exportNote.textContent = "Подготавливаем видео…";
    downloadButton.disabled = true;
    
    try {
        sourceVideo.pause();
        stopVideoLoop();
        sourceVideo.currentTime = 0;
        await new Promise((resolve, reject) => {
            if (sourceVideo.readyState >= 2 && sourceVideo.currentTime === 0) { resolve(); return; }
            sourceVideo.addEventListener("seeked", resolve, { once: true });
            sourceVideo.addEventListener("error", reject, { once: true });
        });
        renderVideoFrame();
        const stream = canvas.captureStream(24);
        const mimeTypes = ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"];
        const mimeType = mimeTypes.find(type => MediaRecorder.isTypeSupported(type));
        if (!mimeType) throw new Error("Нет подходящего формата.");
        
        mediaRecorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 5000000 });
        mediaRecorder.ondataavailable = (event) => {
            if (event.data && event.data.size > 0) recordedChunks.push(event.data);
        };
        const recordingFinished = new Promise((resolve, reject) => {
            mediaRecorder.onstop = resolve;
            mediaRecorder.onerror = () => reject(new Error("Ошибка записи."));
        });
        mediaRecorder.start(500);
        exportNote.textContent = "Идёт обработка видео…";
        await sourceVideo.play();
        
        await new Promise((resolve) => {
            const exportLoop = () => {
                renderVideoFrame();
                if (sourceVideo.ended || sourceVideo.paused) { resolve(); return; }
                requestAnimationFrame(exportLoop);
            };
            requestAnimationFrame(exportLoop);
        });
        
        if (mediaRecorder.state !== "inactive") mediaRecorder.stop();
        await recordingFinished;
        stream.getTracks().forEach(track => track.stop());
        
        const blob = new Blob(recordedChunks, { type: mimeType });
        downloadBlob(blob, `retrosnap-video.${mimeType.includes("webm") ? "webm" : "mp4"}`);
        exportNote.textContent = "Готово! Видео скачано.";
    } catch (error) {
        exportNote.textContent = "Не удалось экспортировать видео: " + error.message;
    } finally {
        exporting = false;
        downloadButton.disabled = false;
        if (sourceVideo.readyState >= 2) sourceVideo.currentTime = Math.min(previousTime, sourceVideo.duration || previousTime);
        if (wasPlaying) { sourceVideo.play().catch(() => {}); startVideoLoop(); } else { renderVideoFrame(); }
    }
}

// --- ИНИЦИАЛИЗАЦИЯ ПРЕСЕТОВ ---
const presetsList = [
    { id: "vhs", name: "VHS", desc: "Analog tape" },
    { id: "polaroid", name: "Polaroid", desc: "Instant film" },
    { id: "club", name: "Club Flash", desc: "Night flash" },
    { id: "camcorder", name: "Camcorder", desc: "90s home video" },
    { id: "y2k", name: "Y2K", desc: "Digital attitude" },
    { id: "comic", name: "Pop Art", desc: "Comic book" },
    { id: "90s-film", name: "90s Film", desc: "Real flash" },
    { id: "g7x", name: "G7X Glow", desc: "Soft & glossy" },
    { id: "glitch", name: "Glitch", desc: "Digital chaos" },
    { id: "custom", name: "Custom", desc: "Minimal frame" }
];

presetGrid.innerHTML = ""; 
presetsList.forEach(preset => {
    const btn = document.createElement("button");
    btn.className = `preset-card ${preset.id === currentPreset ? "active" : ""}`;
    btn.dataset.preset = preset.id;
    btn.type = "button";
    btn.innerHTML = `
        <span class="preset-swatch swatch-${preset.id === "90s-film" ? "vintage" : preset.id}"></span>
        <span class="preset-name">${preset.name}</span>
        <span class="preset-desc">${preset.desc}</span>
    `;
    presetGrid.appendChild(btn);
});

intensityValue.value = "100%";