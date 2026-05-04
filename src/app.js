import { initUpload } from './upload.js';
import { fetchPlantPalettes, renderPalettes, renderExtractionResult } from './matching.js';
import { initMatrix, calculateBOQ } from './matrix.js';
import { renderSeasonalTimeline, calculateWinterStructureScore } from './seasonal.js';
import { exportExcel, saveProjectToStorage } from './export.js';

// App state
const state = {
  currentSection: 'hero',
  imageBase64: null,
  siteConditions: {},
  designDNA: null,
  palettes: [],
  selectedPalette: 0,
  boqData: null
};

window.__appState = state;

// Section navigation
function showSection(id) {
  document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
  const target = document.getElementById(id);
  if (target) {
    target.classList.add('active');
    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  state.currentSection = id;

  // Update nav
  document.querySelectorAll('.nav-link').forEach(a => {
    a.classList.toggle('active', a.dataset.section === id);
  });
}

// Skeleton loading
function showSkeleton(containerId) {
  const el = document.getElementById(containerId);
  if (!el) return;
  el.innerHTML = `
    <div class="skeleton-wrap">
      <div class="skeleton skeleton-line"></div>
      <div class="skeleton skeleton-line short"></div>
      <div class="skeleton skeleton-block"></div>
      <div class="skeleton skeleton-line"></div>
    </div>
  `;
}

function showToast(msg, type = 'info') {
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = msg;
  document.body.appendChild(toast);
  setTimeout(() => toast.classList.add('show'), 10);
  setTimeout(() => { toast.classList.remove('show'); setTimeout(() => toast.remove(), 300); }, 3500);
}

// Initialize upload section
initUpload({
  onImageLoaded(dataUrl) {
    // Image preview ready
  },
  onAnalysisStart() {
    showSection('extraction-section');
    showSkeleton('dna-result');
    document.getElementById('color-palette').innerHTML = '';
    document.getElementById('extraction-loading').style.display = 'flex';
  },
  onAnalysisComplete(designDNA, base64, siteConditions) {
    state.designDNA = designDNA;
    state.imageBase64 = base64;
    state.siteConditions = siteConditions;
    window.__appState = state;

    document.getElementById('extraction-loading').style.display = 'none';
    renderExtractionResult(designDNA, base64);
    document.getElementById('match-plants-btn').disabled = false;
    showToast('風格特徵萃取完成！', 'success');
  },
  onError(msg) {
    showToast(msg, 'error');
    document.getElementById('extraction-loading').style.display = 'none';
  }
});

// Match plants button
document.getElementById('match-plants-btn')?.addEventListener('click', async () => {
  if (!state.designDNA) return;

  showSection('palette-section');
  showSkeleton('palette-results');
  document.getElementById('palette-loading').style.display = 'flex';
  document.getElementById('palette-tabs').innerHTML = '';

  try {
    const palettes = await fetchPlantPalettes(state.designDNA, state.siteConditions);
    state.palettes = palettes;
    state.selectedPalette = 0;
    window.__appState = state;

    document.getElementById('palette-loading').style.display = 'none';
    renderPalettes(palettes, 0);

    // Update matrix with first palette
    matrixController.update();
    showToast('植栽提案生成完成！', 'success');
  } catch (err) {
    showToast(err.message || '植物匹配失敗', 'error');
    document.getElementById('palette-loading').style.display = 'none';
  }
});

// Matrix calculator
const matrixController = initMatrix(() => {
  const palette = state.palettes[state.selectedPalette];
  return palette || null;
});

// Seasonal timeline button
document.getElementById('view-seasonal-btn')?.addEventListener('click', () => {
  const palette = state.palettes[state.selectedPalette];
  if (!palette) { showToast('請先完成植栽提案分析', 'error'); return; }

  // Load plant details from mock data
  fetch('/data/plants-mock.json')
    .then(r => r.json())
    .then(allPlants => {
      const plantIds = (palette.plants || []).map(p => p.id);
      const selected = allPlants.filter(p => plantIds.includes(p.id));
      const score = calculateWinterStructureScore(selected);

      showSection('seasonal-section');
      renderSeasonalTimeline(selected);

      const scoreEl = document.getElementById('winter-score');
      if (scoreEl) {
        scoreEl.textContent = score + '%';
        scoreEl.style.color = score >= 30 ? '#8fa688' : '#c4a882';
      }
    })
    .catch(() => showToast('載入植物資料失敗', 'error'));
});

// Export
document.getElementById('export-excel-btn')?.addEventListener('click', () => {
  const palette = state.palettes[state.selectedPalette];
  if (!palette) { showToast('請先完成植栽提案分析', 'error'); return; }

  const area = parseFloat(document.getElementById('matrix-area')?.value || 100);
  const pot = document.getElementById('matrix-pot')?.value || '5吋';
  const boq = calculateBOQ(area, palette.plants || [], pot);

  exportExcel(palette.name, palette.plants || [], boq, state.siteConditions);
  showToast('Excel 植栽清單已下載', 'success');
});

// Save project
document.getElementById('save-project-btn')?.addEventListener('click', () => {
  if (!state.designDNA) { showToast('尚無可儲存的資料', 'error'); return; }
  saveProjectToStorage({
    designDNA: state.designDNA,
    siteConditions: state.siteConditions,
    palettes: state.palettes,
    selectedPalette: state.selectedPalette
  });
  showToast('專案已儲存至本地', 'success');
});

// Nav links
document.querySelectorAll('.nav-link').forEach(a => {
  a.addEventListener('click', (e) => {
    e.preventDefault();
    const target = a.dataset.section;
    if (target === 'seasonal-section') {
      document.getElementById('view-seasonal-btn')?.click();
    } else {
      showSection(target);
    }
  });
});

// Hero CTA
document.getElementById('hero-cta')?.addEventListener('click', () => showSection('upload-section'));

// "Back to upload" button
document.getElementById('back-to-upload')?.addEventListener('click', () => showSection('upload-section'));

// "To matrix" button
document.getElementById('to-matrix-btn')?.addEventListener('click', () => {
  showSection('matrix-section');
  matrixController.update();
});

// "To seasonal" button (from matrix)
document.getElementById('matrix-to-seasonal-btn')?.addEventListener('click', () => {
  document.getElementById('view-seasonal-btn')?.click();
});

// "To export" button
document.getElementById('to-export-btn')?.addEventListener('click', () => showSection('export-section'));
