import { cleanDefRow } from './cleanData.js';

// ---------------------------------------------------------------------------
// CONSTANTS
// ---------------------------------------------------------------------------
const DATA_FOLDER = './data/';

const LABELS = [
  'Hispanic or Latino',
  'White',
  'Black or African American',
  'Asian',
  'American Indian and Alaska Native',
  'Native Hawaiian and Other Pacific Islander'
];

const COLORS = {
  Declined:   '#c2185b',
  Defendants: '#007acc'
};

// ---------------------------------------------------------------------------
// HELPERS
// ---------------------------------------------------------------------------
async function findLatestYear (prefix) {
  const yearNow = new Date().getFullYear();
  for (let y = yearNow; y >= 2015; y--) {
    const res = await fetch(`${DATA_FOLDER}${prefix}_${y}.xlsx`, { method: 'HEAD' });
    if (res.ok) return y;
  }
  throw new Error(`No ${prefix} file found`);
}

function normalEthnicity (raw) {
  const eth = String(raw).toLowerCase();
  if (eth.includes('white'))                     return 'White';
  if (eth.includes('black'))                     return 'Black or African American';
  if (eth.includes('asian'))                     return 'Asian';
  if (eth.includes('hispanic') || eth.includes('latino'))
                                               return 'Hispanic or Latino';
  if (eth.includes('american indian') || eth.includes('alaska'))
                                               return 'American Indian and Alaska Native';
  if (eth.includes('hawaiian') || eth.includes('pacific'))
                                               return 'Native Hawaiian and Other Pacific Islander';
  return null;
}

// ---------------------------------------------------------------------------
// DATA LOAD
// ---------------------------------------------------------------------------
async function loadData () {
  try {
    const year = await findLatestYear('cases');

    // CASES ---------------------------------------------------------------
    const casesBuf  = await fetch(`${DATA_FOLDER}cases_${year}.xlsx`).then(r => r.arrayBuffer());
    const casesWb   = XLSX.read(casesBuf, { type: 'array' });
    const caseRows  = XLSX.utils.sheet_to_json(casesWb.Sheets[casesWb.SheetNames[0]], { defval: '' });

    const rejected = new Set();
    caseRows.forEach(r => {
      const status = String(r.Status || '').toLowerCase();
      const id     = (r['Case ID'] || r.CaseID || '').toString().trim();
      if (id && status.includes('reject')) rejected.add(id);
    });

    // DEFENDANTS ----------------------------------------------------------
    const defYear  = await findLatestYear('defendants');
    const defBuf   = await fetch(`${DATA_FOLDER}defendants_${defYear}.xlsx`).then(r => r.arrayBuffer());
    const defWb    = XLSX.read(defBuf, { type: 'array' });
    const defRows  = XLSX.utils.sheet_to_json(defWb.Sheets[defWb.SheetNames[0]], { defval: '' });

    const totals   = {}; // overall defendants
    const declined = {}; // declined‑to‑charge
    let totalsN = 0;
    let declinedN = 0;

    defRows.forEach(r => {
      const d = cleanDefRow(r);
      if (!d || !d.ethnicity) return;

      const eth = normalEthnicity(d.ethnicity);
      if (!eth) return;

      totals[eth] = (totals[eth] || 0) + 1;
      totalsN++;

      const id = (d.caseId || r['Case ID'] || '').toString().trim();
      if (rejected.has(id)) {
        declined[eth] = (declined[eth] || 0) + 1;
        declinedN++;
      }
    });

    const declinedData   = LABELS.map(k => ((declined[k] || 0) / (declinedN || 1)) * 100);
    const defendantsData = LABELS.map(k => ((totals[k]   || 0) / (totalsN   || 1)) * 100);

    buildChart(LABELS, declinedData, defendantsData);
  } catch (err) {
    console.error(err);
  }
}

// ---------------------------------------------------------------------------
// CHART
// ---------------------------------------------------------------------------
function buildChart (labels, declinedData, defendantsData) {
  const ctx       = document.getElementById('declinedChart');
  const hoverRace = document.getElementById('hoverRace2');
  const hoverDecl = document.getElementById('hoverDecl');
  const hoverAll  = document.getElementById('hoverAll');

  // Destroy any existing chart on this canvas to avoid "canvas already in use" error
  const existing = Chart.getChart(ctx);
  if (existing) existing.destroy();

  new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        { label: 'Declined',       data: declinedData,   backgroundColor: COLORS.Declined },
        { label: 'All Defendants', data: defendantsData, backgroundColor: COLORS.Defendants }
      ]
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      scales: {
        x: {
          beginAtZero: true,
          ticks: { callback: v => v + '%' },
          suggestedMax: 100
        }
      },
      plugins: { legend: { position: 'top' }, tooltip: { enabled: false } },
      onHover: (evt, els, chart) => {
        const list = chart.getElementsAtEventForMode(evt, 'nearest', { axis: 'y', intersect: false }, false);
        if (list.length) {
          const i = list[0].index;
          hoverRace.textContent = labels[i];
          hoverDecl.textContent = `${declinedData[i].toFixed(2)}% of defendants declined for prosecution`;
          hoverAll.textContent  = `${defendantsData[i].toFixed(2)}% of all defendants`;
        } else {
          hoverRace.textContent = hoverDecl.textContent = hoverAll.textContent = '';
        }
      }
    }
  });
}

// ---------------------------------------------------------------------------
// RUN
// ---------------------------------------------------------------------------
loadData();