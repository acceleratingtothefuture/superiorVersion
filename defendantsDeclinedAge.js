import { cleanDefRow } from './cleanData.js';

// ---------------------------------------------------------------------------
// CONSTANTS
// ---------------------------------------------------------------------------
const DATA_FOLDER = './data/';

const LABELS = ['20–29', '30–39', '40–49', '50–59', '60+'];

const COLORS = {
  Declined:   '#c2185b',  // magenta (matches ethnicity declined chart)
  Defendants: '#007acc'   // blue
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

function mapAgeGroup (age) {
  if (!Number.isFinite(age)) return null;
  if (age >= 20 && age <= 29) return '20–29';
  if (age >= 30 && age <= 39) return '30–39';
  if (age >= 40 && age <= 49) return '40–49';
  if (age >= 50 && age <= 59) return '50–59';
  if (age >= 60)              return '60+';
  return null; // ignore <20
}

// ---------------------------------------------------------------------------
// DATA LOAD
// ---------------------------------------------------------------------------
async function loadData () {
  try {
    const yearCases = await findLatestYear('cases');

    // CASES -> rejected IDs
    const casesBuf = await fetch(`${DATA_FOLDER}cases_${yearCases}.xlsx`).then(r => r.arrayBuffer());
    const casesWb  = XLSX.read(casesBuf, { type: 'array' });
    const caseRows = XLSX.utils.sheet_to_json(casesWb.Sheets[casesWb.SheetNames[0]], { defval: '' });

    const rejected = new Set();
    caseRows.forEach(r => {
      const status = String(r.Status || '').toLowerCase();
      const id     = (r['Case ID'] || r.CaseID || '').toString().trim();
      if (id && status.includes('reject')) rejected.add(id);
    });

    // DEFENDANTS
    const yearDefs = await findLatestYear('defendants');
    const defBuf   = await fetch(`${DATA_FOLDER}defendants_${yearDefs}.xlsx`).then(r => r.arrayBuffer());
    const defWb    = XLSX.read(defBuf, { type: 'array' });
    const defRows  = XLSX.utils.sheet_to_json(defWb.Sheets[defWb.SheetNames[0]], { defval: '' });

    const totals   = {};  // all defendants
    const declined = {};  // declined-to-charge
    let totalsN = 0;
    let declinedN = 0;

    defRows.forEach(r => {
      const d = cleanDefRow(r);
      if (!d) return;
      const g = mapAgeGroup(d.age);
      if (!g) return;

      totals[g] = (totals[g] || 0) + 1;
      totalsN++;

      const id = (d.case_id || d.caseId || r['Case ID'] || '').toString().trim();
      if (rejected.has(id)) {
        declined[g] = (declined[g] || 0) + 1;
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
  const ctx       = document.getElementById('declinedAgeChart');
  const hoverLbl  = document.getElementById('hoverAgeLabel2');
  const hoverDecl = document.getElementById('hoverAgeDecl');
  const hoverAll  = document.getElementById('hoverAgeAll');

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
          hoverLbl.textContent  = labels[i];
          hoverDecl.textContent = `${declinedData[i].toFixed(2)}% of defendants declined`;
          hoverAll.textContent  = `${defendantsData[i].toFixed(2)}% of all defendants`;
        } else {
          hoverLbl.textContent = hoverDecl.textContent = hoverAll.textContent = '';
        }
      }
    }
  });
}

// ---------------------------------------------------------------------------
// RUN
// ---------------------------------------------------------------------------
loadData();