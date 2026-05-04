export async function fetchPlantPalettes(designDNA, siteConditions) {
  // Build semantic query from designDNA for vector search
  const queryParts = [
    designDNA.design_dna_summary || '',
    ...(designDNA.piet_aesthetic_tags || []),
    ...(designDNA.texture_tags || []),
    designDNA.season_estimate ? `${designDNA.season_estimate}季節特徵` : '',
    'Piet Oudolf 矩陣種植 台灣原生植物景觀設計'
  ].filter(Boolean);
  const semanticQuery = queryParts.join('，');

  // Query Supabase RAG vector search
  let chunks = [];
  try {
    const ragRes = await fetch('/api/query-rag', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: semanticQuery, top_k: 5 })
    });
    const ragData = await ragRes.json();
    chunks = ragData.chunks || [];
  } catch (e) {
    console.warn('[RAG] query-rag failed, proceeding without RAG context:', e.message);
  }

  // Then fetch plant matching
  const matchRes = await fetch('/api/match-plants', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ designDNA, siteConditions, ragChunks: chunks })
  });

  const matchText = await matchRes.text();
  if (!matchRes.ok || matchText.trimStart().startsWith('<')) {
    let detail = `HTTP ${matchRes.status}`;
    try { detail = JSON.parse(matchText).error || detail; } catch (_) {}
    throw new Error(`植物匹配失敗：${detail}`);
  }

  const { palettes } = JSON.parse(matchText);
  return palettes;
}

export function renderPalettes(palettes, selectedIndex, allPlantsData) {
  const container = document.getElementById('palette-results');
  const tabs = document.getElementById('palette-tabs');
  if (!container || !tabs) return;

  // Render tabs
  tabs.innerHTML = palettes.map((p, i) => `
    <button class="palette-tab ${i === selectedIndex ? 'active' : ''}" data-index="${i}">
      <span class="tab-score">${p.similarity_score}%</span>
      <span class="tab-name">${p.name}</span>
    </button>
  `).join('');

  // Render selected palette
  const palette = palettes[selectedIndex];
  if (!palette) return;

  const roleLabels = { matrix: '基質植物', primary: '初級植物', scatter: '散布植物', filler: '填充植物' };
  const roleColors = { matrix: '#8fa688', primary: '#7b9e8a', scatter: '#c4a882', filler: '#b8b5ae' };

  // Group plants by role
  const byRole = {};
  (palette.plants || []).forEach(p => {
    if (!byRole[p.role]) byRole[p.role] = [];
    byRole[p.role].push(p);
  });

  container.innerHTML = `
    <div class="palette-header">
      <div class="palette-score-badge">${palette.similarity_score}% 符合度</div>
      <p class="palette-description">${palette.description || ''}</p>
    </div>

    <div class="palette-principle">
      <span class="principle-label">Piet 原則基礎</span>
      <p>${palette.piet_principle_basis || ''}</p>
    </div>

    <div class="role-groups">
      ${['matrix', 'primary', 'scatter', 'filler'].map(role => {
        const plants = byRole[role] || [];
        if (!plants.length) return '';
        return `
          <div class="role-group">
            <div class="role-header" style="border-left-color: ${roleColors[role]}">
              <span class="role-label">${roleLabels[role]}</span>
              <span class="role-pct">${role === 'matrix' ? '50%' : role === 'primary' ? '30%' : role === 'scatter' ? '10%' : '10%'}</span>
            </div>
            <div class="plant-cards">
              ${plants.map(p => renderPlantCard(p)).join('')}
            </div>
          </div>
        `;
      }).join('')}
    </div>

    <div class="seasonal-notes">
      <h4>台灣中部四季觀察</h4>
      <div class="seasonal-grid">
        ${Object.entries(palette.seasonal_notes || {}).map(([season, note]) => {
          const labels = { spring: '春', summer: '夏', autumn: '秋', winter: '冬' };
          const colors = { spring: '#7db87d', summer: '#e8c820', autumn: '#d4a84b', winter: '#b5926e' };
          return `
            <div class="seasonal-note" style="border-top-color: ${colors[season]}">
              <span class="season-label">${labels[season] || season}</span>
              <p>${note}</p>
            </div>
          `;
        }).join('')}
      </div>
    </div>
  `;

  // Re-attach tab click events
  tabs.querySelectorAll('.palette-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = parseInt(btn.dataset.index);
      renderPalettes(palettes, idx, allPlantsData);
      // Update app state
      window.__appState = { ...window.__appState, selectedPalette: idx };
    });
  });
}

function renderPlantCard(plant) {
  return `
    <div class="plant-card glass-card">
      <div class="plant-card-body">
        <div class="plant-names">
          <span class="plant-name-zh">${plant.name_zh}</span>
          <span class="plant-name-latin">${plant.name_latin}</span>
        </div>
        <div class="plant-meta">
          <span class="piet-analog">≈ ${plant.piet_analog}</span>
          <span class="plant-reason">${plant.reason_zh}</span>
        </div>
      </div>
    </div>
  `;
}

export function renderExtractionResult(designDNA, imageBase64) {
  const section = document.getElementById('extraction-section');
  if (!section) return;

  const img = section.querySelector('#extracted-image');
  if (img && imageBase64) {
    img.src = `data:image/jpeg;base64,${imageBase64}`;
  }

  // Render design DNA
  const dnaContainer = section.querySelector('#dna-result');
  if (!dnaContainer) return;

  const rd = designDNA.role_distribution || {};
  const tags = [...(designDNA.piet_aesthetic_tags || []), ...(designDNA.texture_tags || [])];

  dnaContainer.innerHTML = `
    <div class="dna-summary">
      <p class="dna-text">${designDNA.design_dna_summary || ''}</p>
    </div>

    <div class="dna-grid">
      <div class="dna-item">
        <span class="dna-label">季節估算</span>
        <span class="dna-value">${designDNA.season_estimate || '-'}</span>
      </div>
      <div class="dna-item">
        <span class="dna-label">霧感評分</span>
        <span class="dna-value">${designDNA.foggy_score ?? '-'} / 10</span>
      </div>
      <div class="dna-item">
        <span class="dna-label">冬季骨幹</span>
        <span class="dna-value">${designDNA.winter_structure_score ?? '-'} / 10</span>
      </div>
    </div>

    <div class="role-bars">
      ${[
        { key: 'matrix', label: '基質', color: '#8fa688' },
        { key: 'primary', label: '初級', color: '#7b9e8a' },
        { key: 'scatter', label: '散布', color: '#c4a882' },
        { key: 'filler', label: '填充', color: '#b8b5ae' }
      ].map(r => `
        <div class="role-bar-row">
          <span class="role-bar-label">${r.label}</span>
          <div class="role-bar-track">
            <div class="role-bar-fill" style="width:${rd[r.key] || 0}%; background:${r.color}"></div>
          </div>
          <span class="role-bar-pct">${rd[r.key] || 0}%</span>
        </div>
      `).join('')}
    </div>

    <div class="aesthetic-tags">
      ${tags.map(t => `<span class="tag">${t}</span>`).join('')}
    </div>

    ${(designDNA.identified_plants || []).length > 0 ? `
      <div class="identified-plants">
        <h4>辨識植物</h4>
        ${designDNA.identified_plants.map(p => `
          <div class="id-plant">
            <span class="id-plant-name">${p.name_zh || ''} <em>${p.name_en}</em></span>
            <span class="id-plant-role">${p.role}</span>
            <span class="id-confidence">${Math.round((p.confidence || 0) * 100)}%</span>
          </div>
        `).join('')}
      </div>
    ` : ''}
  `;

  // Render color palette
  const colors = designDNA.dominant_colors || [];
  const colorPalette = section.querySelector('#color-palette');
  if (colorPalette) {
    colorPalette.innerHTML = colors.map(c => `
      <div class="color-swatch" style="background:${c}" title="${c}"></div>
    `).join('');
  }
}
