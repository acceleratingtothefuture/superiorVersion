import { cleanDefRow } from './cleanData.js';

// ---------------------------------------------------------------------------
// CONSTANTS
// ---------------------------------------------------------------------------
const DATA_FOLDER = './data/';

const POPULATION = {
  'Hispanic or Latino': 153027,
  'White': 16813,
  'Black or African American': 4362,
  'Asian': 3049,
  'American Indian and Alaska Native': 4266,
  'Native Hawaiian and Other Pacific Islander': 165
};

const ETHNICITY_COLORS = {
  'Hispanic or Latino': '#e91e63',
  'White': '#ff9800',
  'Black or African American': '#ffe600',
  'Asian': '#4caf50',
  'American Indian and Alaska Native': '#00bcd4',
  'Native Hawaiian and Other Pacific Islander': '#9c27b0'
};

const DEF_COLOR = '#007acc';
const POP_COLOR = '#ff9800';

// ---------------------------------------------------------------------------
// HELPERS
// ---------------------------------------------------------------------------
async function findLatestYear (prefix) {
  const current = new Date().getFullYear();
  for (let y = current; y >= 2015; y--) {
    const res = await fetch(`${DATA_FOLDER}${prefix}_${y}.xlsx`, { method: 'HEAD' });
    if (res.ok) return y;
  }
  throw new Error(`No file found for prefix ${prefix}`);
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
// DATA LOAD + CHART
// ---------------------------------------------------------------------------
let ethnicityChart = null;

async function loadData () {
  // Show loading text, hide chart wrapper
  const loadingEl = document.getElementById('ethnicityLoading');
  const chartWrapper = document.getElementById('ethnicityChartWrapper');

  loadingEl.style.display = 'block';
  chartWrapper.style.display = 'none';



  try {
    const year = await findLatestYear('defendants');

    // Fetch and parse Excel data
    const buf    = await fetch(`${DATA_FOLDER}defendants_${year}.xlsx`).then(r => r.arrayBuffer());
    const wb     = XLSX.read(buf, { type: 'array' });
    const sheet  = wb.Sheets[wb.SheetNames[0]];
    const rows   = XLSX.utils.sheet_to_json(sheet, { defval: '' });

    document.getElementById('ethnicitySub').innerHTML = `
  This chart compares the racial/ethnic breakdown of defendants to Imperial County’s population. <strong>(${year})</strong>
`;

    const counts = {};
    let total    = 0;

    rows.forEach(r => {
      const d = cleanDefRow(r);
      if (!d || !d.ethnicity) return;
      const eth = normalEthnicity(d.ethnicity);
      if (!eth) return;
      counts[eth] = (counts[eth] || 0) + 1;
      total++;
    });

    const labels     = Object.keys(POPULATION);
    const popTotal   = Object.values(POPULATION).reduce((a, b) => a + b, 0);
    const defData    = labels.map(k => ((counts[k] || 0) / (total || 1)) * 100);
    const popData    = labels.map(k => (POPULATION[k] / popTotal) * 100);

    buildChart(labels, defData, popData);

    // Wait 500ms before swapping loading/graph visibility
    await new Promise(resolve => setTimeout(resolve, 500));

    loadingEl.style.display = 'none';
    chartWrapper.style.display = 'block';

  } catch (err) {
    console.error(err);
    loadingEl.textContent = 'Failed to load data.';
  }
}


function buildChart (labels, defData, popData) {
  const ctx       = document.getElementById('barChart');
  const hoverRace = document.getElementById('hoverRace');
  const hoverDef  = document.getElementById('hoverDef');
  const hoverPop  = document.getElementById('hoverPop');

  if (ethnicityChart) {
    ethnicityChart.destroy();
  }

  ethnicityChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        { label: 'Defendants', data: defData, backgroundColor: DEF_COLOR },
        { label: 'Population', data: popData, backgroundColor: POP_COLOR }
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
          hoverDef.textContent  = `${defData[i].toFixed(2)}% of defendants`;
          hoverPop.textContent  = `${popData[i].toFixed(2)}% of population`;
        } else {
          hoverRace.textContent = hoverDef.textContent = hoverPop.textContent = '';
        }
      }
    }
  });
}

// Kick off loading
loadData();
