
import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile } from '@ffmpeg/util';
import './style.css';

const $ = (id) => document.getElementById(id);

const fileInput = $('fileInput');
const uploadArea = $('uploadArea');
const selectedFile = $('selectedFile');
const convertButton = $('convertButton');
const buttonText = $('buttonText');
const quality = $('quality');
const outputNameInput = $('outputName');
const coverInput = $('coverInput');
const progressSection = $('progressSection');
const progressLabel = $('progressLabel');
const progressPercent = $('progressPercent');
const progressBar = $('progressBar');
const progressNote = $('progressNote');
const result = $('result');
const resultInfo = $('resultInfo');
const downloadButton = $('downloadButton');
const errorMessage = $('errorMessage');

let selectedVideo = null;
let selectedCover = null;
let ffmpeg = null;
let isBusy = false;
let downloadUrl = null;

function formatSize(bytes) {
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function showError(message) {
  errorMessage.textContent = message;
  errorMessage.classList.remove('hidden');
}

function hideError() {
  errorMessage.textContent = '';
  errorMessage.classList.add('hidden');
}

function setProgress(percent, label, note = '') {
  const value = Math.max(0, Math.min(100, Math.round(percent)));
  progressBar.style.width = `${value}%`;
  progressPercent.textContent = `${value} %`;
  progressLabel.textContent = label;
  progressNote.textContent = note;
}

function cleanDownload() {
  if (downloadUrl) {
    URL.revokeObjectURL(downloadUrl);
    downloadUrl = null;
  }
  result.classList.add('hidden');
}

function chooseFile(file) {
  if (!file) return;

  if (!file.type.startsWith('video/') &&
      !/\.(mp4|mov|m4v|webm|mkv|avi)$/i.test(file.name)) {
    showError('Bitte wähle eine Videodatei aus.');
    return;
  }

  if (file.size === 0) {
    showError('Die ausgewählte Datei ist leer.');
    return;
  }

  if (file.size > 2 * 1024 * 1024 * 1024) {
    showError('Die Datei ist größer als 2 GB. Bitte wähle ein kleineres Video.');
    return;
  }

  selectedVideo = file;
  $('fileName').textContent = file.name;
  $('fileSize').textContent = formatSize(file.size);

  uploadArea.classList.add('hidden');
  selectedFile.classList.remove('hidden');
  convertButton.disabled = false;

  cleanDownload();
  hideError();
  progressSection.classList.add('hidden');
  buttonText.textContent = 'In MP3 umwandeln';
}

function removeSelectedFile() {
  if (isBusy) return;

  selectedVideo = null;
  fileInput.value = '';

  uploadArea.classList.remove('hidden');
  selectedFile.classList.add('hidden');
  convertButton.disabled = true;

  progressSection.classList.add('hidden');
  cleanDownload();
  hideError();
}

async function getFFmpeg() {
  if (ffmpeg && ffmpeg.loaded) {
    return ffmpeg;
  }

  ffmpeg = new FFmpeg();

  const base = import.meta.env.BASE_URL;

  progressSection.classList.remove('hidden');
  setProgress(5, 'Konverter wird geladen …',
    'Das kann beim ersten Start einen Moment dauern.');

  const coreURL = `${base}ffmpeg/ffmpeg-core.js`;
const wasmURL = `${base}ffmpeg/ffmpeg-core.wasm`;

  await ffmpeg.load({
    coreURL,
    wasmURL
  });

  return ffmpeg;
}

async function convertVideo() {
  if (!selectedVideo || isBusy) return;

  isBusy = true;
  convertButton.disabled = true;
  fileInput.disabled = true;
  quality.disabled = true;

  hideError();
  cleanDownload();
  progressSection.classList.remove('hidden');

  buttonText.textContent = 'Wird umgewandelt …';

  let inputName = 'input.mp4';
  const extension = selectedVideo.name.match(/\.([a-z0-9]+)$/i);

  if (extension) {
    inputName = `input.${extension[1].toLowerCase()}`;
  }

    const outputName = 'audio-studio-output.mp3';
  const originalName = selectedVideo.name.replace(/\.[^/.]+$/, '');
  const customName = outputNameInput.value.trim()
    .replace(/\.mp3$/i, '')
    .replace(/[\\/:*?"<>|]/g, '-')
    .replace(/[. ]+$/g, '')
    .slice(0, 100);

  const downloadName = `${customName || originalName}.mp3`;

  try {
    setProgress(2, 'Konverter wird geladen …');

    const engine = await getFFmpeg();

    setProgress(12, 'Video wird vorbereitet …',
      'Dein Video wird für die Umwandlung eingelesen.');

    await engine.writeFile(inputName, await fetchFile(selectedVideo));

    setProgress(15, 'Audio wird umgewandelt …',
      'Bitte lasse die Seite geöffnet.');

    engine.on('progress', ({ progress }) => {
      if (!isBusy || !Number.isFinite(progress)) return;

      const percent = 15 + Math.max(0, Math.min(1, progress)) * 80;
      setProgress(percent, 'Audio wird umgewandelt …',
        'Das kann je nach Länge des Videos etwas dauern.');
    });

    const bitrate = `${quality.value}k`;

    const exitCode = await engine.exec([
      '-i', inputName,
      '-vn',
      '-codec:a', 'libmp3lame',
      '-b:a', bitrate,
      '-y',
      outputName
    ]);

    if (exitCode !== 0) {
      throw new Error('Die Umwandlung konnte nicht abgeschlossen werden.');
    }

    setProgress(98, 'MP3 wird fertiggestellt …');

    const data = await engine.readFile(outputName);
    const audioBlob = new Blob([data], { type: 'audio/mpeg' });

    downloadUrl = URL.createObjectURL(audioBlob);
    downloadButton.href = downloadUrl;

    downloadButton.download = downloadName;

    resultInfo.textContent =
      `${formatSize(audioBlob.size)} · ${bitrate}`;

    setProgress(100, 'Erfolgreich umgewandelt!',
      'Deine MP3-Datei ist jetzt bereit.');

    result.classList.remove('hidden');
  } catch (error) {
    console.error('Audio Studio Fehler:', error);

  let message = error?.message || String(error) || JSON.stringify(error);

    if (message.includes('memory') || message.includes('Memory')) {
      message = 'Dein Gerät hat nicht genug freien Speicher. Bitte versuche ein kleineres Video.';
    } else if (message.includes('fetch') || message.includes('404')) {
      message = 'Die Konverter-Dateien konnten nicht geladen werden. Bitte lade die Seite neu und versuche es erneut.';
    } else {
      message = `Die Umwandlung ist fehlgeschlagen: ${message}`;
    }

    showError(message);
    progressSection.classList.add('hidden');
  } finally {
    isBusy = false;
    convertButton.disabled = !selectedVideo;
    fileInput.disabled = false;
    quality.disabled = false;
    buttonText.textContent = 'In MP3 umwandeln';

    if (ffmpeg?.loaded) {
      try {
        await ffmpeg.deleteFile(inputName);
      } catch {
        // Die temporäre Datei wurde möglicherweise bereits entfernt.
      }

      try {
        await ffmpeg.deleteFile(outputName);
      } catch {
        // Die temporäre Datei wurde möglicherweise bereits entfernt.
      }
    }
  }
}

fileInput.addEventListener('change', (event) => {
  chooseFile(event.target.files?.[0]);
});

$('removeFile').addEventListener('click', removeSelectedFile);
convertButton.addEventListener('click', convertVideo);

uploadArea.addEventListener('dragover', (event) => {
  event.preventDefault();
  uploadArea.classList.add('dragging');
});

uploadArea.addEventListener('dragleave', () => {
  uploadArea.classList.remove('dragging');
});

uploadArea.addEventListener('drop', (event) => {
  event.preventDefault();
  uploadArea.classList.remove('dragging');
  chooseFile(event.dataTransfer?.files?.[0]);
});

window.addEventListener('beforeunload', () => {
  if (downloadUrl) {
    URL.revokeObjectURL(downloadUrl);
  }
});

