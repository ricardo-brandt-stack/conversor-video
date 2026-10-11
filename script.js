let selectedFile = null;

// Elementos DOM
const themeToggle = document.getElementById('theme-toggle');
const themeIcon = document.getElementById('theme-icon');
const fileInput = document.getElementById('file-input');
const uploadStatus = document.getElementById('upload-status');
const videoPreview = document.getElementById('video-preview');
const videoPreviewContainer = document.getElementById('video-preview-container');
const formatSelect = document.getElementById('format-select');
const convertBtn = document.getElementById('convert-btn');
const progressContainer = document.getElementById('progress-container');
const progressBar = document.getElementById('progress-bar');
const progressText = document.getElementById('progress-text');

// =========================================================
// 1. GERENCIAMENTO DE TEMA (DARK MODE)
// =========================================================
const currentTheme = localStorage.getItem('theme');
if (currentTheme === 'dark') {
    document.body.classList.add('dark-mode');
    if (themeIcon) themeIcon.textContent = '☀️';
}

if (themeToggle) {
    themeToggle.addEventListener('click', () => {
        document.body.classList.toggle('dark-mode');
        const isDark = document.body.classList.contains('dark-mode');
        if (themeIcon) themeIcon.textContent = isDark ? '☀️' : '🌙';
        localStorage.setItem('theme', isDark ? 'dark' : 'light');
    });
}

// =========================================================
// 2. SELEÇÃO E CARREGAMENTO DE VÍDEO
// =========================================================
fileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;

    selectedFile = file;
    uploadStatus.textContent = `Vídeo selecionado: ${file.name}`;
    
    const fileURL = URL.createObjectURL(file);
    videoPreview.src = fileURL;
    videoPreviewContainer.classList.remove('hidden');
    convertBtn.disabled = false;
});

// =========================================================
// 3. CONVERSÃO DE VÍDEO COM ÁUDIO SINCRONIZADO
// =========================================================
convertBtn.addEventListener('click', async () => {
    if (!selectedFile) return;

    const targetFormat = formatSelect.value;
    convertBtn.disabled = true;
    progressContainer.classList.remove('hidden');
    updateProgress(5);

    try {
        if (targetFormat === 'mp3' || targetFormat === 'wav') {
            convertBtn.textContent = 'Extraindo áudio do vídeo...';
            await extractAudioFromVideo(selectedFile, targetFormat);
        } else {
            convertBtn.textContent = 'Convertendo vídeo e áudio...';
            await convertVideoWithAudio(selectedFile, targetFormat);
        }

        convertBtn.textContent = 'Conversão Concluída!';
        setTimeout(() => {
            convertBtn.textContent = '⚡ Converter e Baixar';
            convertBtn.disabled = false;
        }, 3000);

    } catch (err) {
        console.error('Erro ao converter:', err);
        alert('Ocorreu um erro ao converter o vídeo.');
        convertBtn.textContent = '⚡ Converter e Baixar';
        convertBtn.disabled = false;
    }
});

function updateProgress(percent) {
    progressBar.style.width = `${percent}%`;
    progressText.textContent = `${percent}%`;
}

// Conversão de Vídeo mantendo Faixa de Áudio Original
function convertVideoWithAudio(file, format) {
    return new Promise((resolve, reject) => {
        const video = document.createElement('video');
        video.src = URL.createObjectURL(file);
        video.playsInline = true;
        
        // Mantém o vídeo mudo durante o processamento visual para não reproduzir o som no alto-falante
        video.muted = false; 
        video.volume = 1.0;

        video.onloadedmetadata = () => {
            // Captura o stream diretamente do elemento de vídeo (Vídeo + Áudio)
            let stream = null;
            if (typeof video.captureStream === 'function') {
                stream = video.captureStream();
            } else if (typeof video.mozCaptureStream === 'function') {
                stream = video.mozCaptureStream();
            } else {
                reject(new Error('Navegador não suporta a captura de stream de vídeo.'));
                return;
            }

            // Seleciona o MimeType compatível com o navegador
            let mimeType = 'video/webm;codecs=vp8,opus';
            if (format === 'mp4' && MediaRecorder.isTypeSupported('video/mp4')) {
                mimeType = 'video/mp4';
            } else if (!MediaRecorder.isTypeSupported(mimeType)) {
                mimeType = 'video/webm';
            }

            const mediaRecorder = new MediaRecorder(stream, { mimeType });
            const chunks = [];

            mediaRecorder.ondataavailable = (e) => {
                if (e.data && e.data.size > 0) chunks.push(e.data);
            };

            mediaRecorder.onstop = () => {
                const finalBlob = new Blob(chunks, { type: mimeType });
                updateProgress(100);
                downloadBlob(finalBlob, getOutputName(file.name, format));
                resolve();
            };

            // Inicia o processamento
            video.currentTime = 0;
            video.play().then(() => {
                mediaRecorder.start();
            }).catch(reject);

            // Acompanhamento do progresso em tempo real
            const interval = setInterval(() => {
                if (video.duration) {
                    const progress = Math.round((video.currentTime / video.duration) * 100);
                    updateProgress(Math.min(progress, 99));
                }
            }, 200);

            video.onended = () => {
                clearInterval(interval);
                mediaRecorder.stop();
            };
        };

        video.onerror = (err) => reject(err);
    });
}

// Extração de Áudio de Vídeo para MP3/WAV
async function extractAudioFromVideo(file, format) {
    const arrayBuffer = await file.arrayBuffer();
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    
    updateProgress(20);
    const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
    updateProgress(60);

    let blob;
    if (format === 'wav') {
        blob = bufferToWav(audioBuffer);
    } else {
        blob = await bufferToMp3Audio(audioBuffer, audioCtx);
    }

    updateProgress(100);
    downloadBlob(blob, getOutputName(file.name, format));
}

function getOutputName(originalName, ext) {
    const nameWithoutExt = originalName.substring(0, originalName.lastIndexOf('.')) || originalName;
    return `${nameWithoutExt}_convertido.${ext}`;
}

function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
}

// Converte áudio para formato WAV
function bufferToWav(buffer) {
    const numOfChan = buffer.numberOfChannels;
    const length = buffer.length * numOfChan * 2 + 44;
    const out = new DataView(new ArrayBuffer(length));
    let channels = [], sampleRate = buffer.sampleRate, offset = 0, pos = 0;

    function setUint16(data) { out.setUint16(pos, data, true); pos += 2; }
    function setUint32(data) { out.setUint32(pos, data, true); pos += 4; }

    setUint32(0x46464952); setUint32(length - 8); setUint32(0x45564157); setUint32(0x20746d66);
    setUint32(16); setUint16(1); setUint16(numOfChan); setUint32(sampleRate);
    setUint32(sampleRate * 2 * numOfChan); setUint16(numOfChan * 2); setUint16(16);
    setUint32(0x61746164); setUint32(length - pos - 4);

    for (let i = 0; i < buffer.numberOfChannels; i++) channels.push(buffer.getChannelData(i));

    while (offset < buffer.length) {
        for (let i = 0; i < numOfChan; i++) {
            let sample = Math.max(-1, Math.min(1, channels[i][offset]));
            sample = (0.5 + sample < 0 ? sample * 32768 : sample * 32767) | 0;
            out.setInt16(pos, sample, true);
            pos += 2;
        }
        offset++;
    }
    return new Blob([out], { type: 'audio/wav' });
}

// Converte áudio extraído
function bufferToMp3Audio(buffer, ctx) {
    return new Promise((resolve) => {
        const dest = ctx.createMediaStreamDestination();
        const source = ctx.createBufferSource();
        source.buffer = buffer;
        source.connect(dest);

        const recorder = new MediaRecorder(dest.stream);
        const chunks = [];

        recorder.ondataavailable = e => chunks.push(e.data);
        recorder.onstop = () => resolve(new Blob(chunks, { type: 'audio/mp3' }));

        recorder.start();
        source.start(0);

        source.onended = () => recorder.stop();
    });
}