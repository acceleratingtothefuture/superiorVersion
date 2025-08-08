import { cleanDefRow } from './cleanData.js';

// ---------------------------------------------------------------------------
// CONSTANTS
// ---------------------------------------------------------------------------
const DATA_FOLDER = './data/';

const LABELS = ['20–29', '30–39', '40–49', '50–59', '60+'];

// 2020 Census age‑group counts (Imperial County)
// Source: User‑supplied figures
const POPULATION = {
  '20–29': 26169,
  '30–39': 25065,
  '40–49': 20257,
  '50–59': 19196,
  '60+':   35773
};

const DEF_COLOR = '#007acc';   // blue (matches ethnicity chart)
const POP_COLOR = '#ff9800';   // orange

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

function mapAgeGroup (age) {
  if (!Number.isFinite(age)) return null;
  if (age >= 20 && age <= 29) return '20–29';
  if (age >= 30 && age <= 39) return '30–39';
  if (age >= 40 && age <= 49) return '40–49';
  if (age >= 50 && age <= 59) return '50–59';
  if (age >= 60)              return '60+';
  return null; // ignore <20 for this viz
}

// ---------------------------------------------------------------------------
// DATA LOAD + CHART
// ---------------------------------------------------------------------------
async function loadData () {
  try {
    const year = await findLatestYear('defendants');

    const buf   = await fetch(`${DATA_FOLDER}defendants_${year}.xlsx`).then(r => r.arrayBuffer());
    const wb    = XLSX.read(buf, { type: 'array' });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const rows  = XLSX.utils.sheet_to_json(sheet, { defval: '' });

    const counts = {};
    let total = 0;

    rows.forEach(r => {
      const d = cleanDefRow(r);
      if (!d) return;
      const g = mapAgeGroup(d.age);
      if (!g) return;
      counts[g] = (counts[g] || 0) + 1;
      total++;
    });

    const popTotal = Object.values(POPULATION).reduce((a, b) => a + b, 0);

    const defData = LABELS.map(k => ((counts[k] || 0) / (total || 1)) * 100);
    const popData = LABELS.map(k => (POPULATION[k] / popTotal) * 100);

    buildChart(LABELS, defData, popData);
  } catch (err) {
    console.error(err);
  }
}

function buildChart (labels, defData, popData) {
  const ctx       = document.getElementById('ageChart');
  const hoverLbl  = document.getElementById('hoverAgeLabel');
  const hoverDef  = document.getElementById('hoverAgeDef');
  const hoverPop  = document.getElementById('hoverAgePop');

  const existing = Chart.getChart(ctx);
  if (existing) existing.destroy();

  new Chart(ctx, {
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
          hoverLbl.textContent = labels[i];
          hoverDef.textContent = `${defData[i].toFixed(2)}% of defendants`;
          hoverPop.textContent = `${popData[i].toFixed(2)}% of population`;
        } else {
          hoverLbl.textContent = hoverDef.textContent = hoverPop.textContent = '';
        }
      }
    }
  });
}

// kick‑off
loadData();