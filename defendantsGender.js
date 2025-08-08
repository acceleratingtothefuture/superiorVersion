import { cleanDefRow } from './cleanData.js';

// ---------------------------------------------------------------------------
// CONSTANTS
// ---------------------------------------------------------------------------
const DATA_FOLDER = './data/';

const LABELS = ['Male', 'Female', 'Other / Unknown'];

const COLORS = {
  Declined:   '#8e24aa',  // purple
  Defendants: '#009688'   // teal
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

function mapGender (raw) {
  const t = String(raw).toLowerCase();
  if (t.startsWith('m')) return 'Male';
  if (t.startsWith('f')) return 'Female';
  return 'Other / Unknown';
}

// ---------------------------------------------------------------------------
// DATA LOAD
// ---------------------------------------------------------------------------
async function loadData () {
  try {
    const yearCases = await findLatestYear('cases');

    // CASES -> find rejected IDs
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

    const totals   = {};
    const declined = {};
    let totalsN = 0;
    let declinedN = 0;

    defRows.forEach(r => {
      const d = cleanDefRow(r);
      if (!d || !d.gender) return;

      const g = mapGender(d.gender);
      totals[g] = (totals[g] || 0) + 1;
      totalsN++;

      const id = (d.caseId || r['Case ID'] || '').toString().trim();
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
  const ctx       = document.getElementById('genderChart');
  const hoverRace = document.getElementById('hoverGender');
  const hoverDecl = document.getElementById('hoverDeclG');
  const hoverAll  = document.getElementById('hoverAllG');

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