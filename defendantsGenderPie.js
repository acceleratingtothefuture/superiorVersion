// defendantsGenderPie.js
import { cleanDefRow } from './cleanData.js';

/* ------------------------------------------------------------------ */
/* CONSTANTS                                                          */
/* ------------------------------------------------------------------ */
const DATA_FOLDER = './data/';

const LABELS = ['Male', 'Female', 'Other / Unknown'];

const COLORS = {
  Male:   '#2196f3',   // blue
  Female: '#e91e63',   // pink
  'Other / Unknown': '#9e9e9e' // gray
};

/* ------------------------------------------------------------------ */
/* HELPERS                                                            */
/* ------------------------------------------------------------------ */
async function findLatestYear(prefix) {
  const current = new Date().getFullYear();
  for (let y = current; y >= 2015; y--) {
    const res = await fetch(`${DATA_FOLDER}${prefix}_${y}.xlsx`, { method: 'HEAD' });
    if (res.ok) return y;
  }
  throw new Error(`No ${prefix} file found`);
}

function mapGender(raw) {
  const t = String(raw).toLowerCase();
  if (t.startsWith('m')) return 'Male';
  if (t.startsWith('f')) return 'Female';
  return 'Other / Unknown';
}

/* ------------------------------------------------------------------ */
/* DATA + CHART                                                       */
/* ------------------------------------------------------------------ */
async function loadData() {
  const year  = await findLatestYear('defendants');
  const buf   = await fetch(`${DATA_FOLDER}defendants_${year}.xlsx`).then(r => r.arrayBuffer());
  const wb    = XLSX.read(buf, { type: 'array' });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows  = XLSX.utils.sheet_to_json(sheet, { defval: '' });

  const counts = { Male: 0, Female: 0, 'Other / Unknown': 0 };
  let total = 0;

  rows.forEach(r => {
    const d = cleanDefRow(r);
    if (!d || !d.gender) return;
    const g = mapGender(d.gender);
    counts[g]++;
    total++;
  });

  const data = LABELS.map(l => ((counts[l] || 0) / (total || 1)) * 100);
  buildChart(LABELS, data);
}

function buildChart(labels, data) {
  const ctx   = document.getElementById('genderPieChart');
  const lblEl = document.getElementById('hoverGenderLabel');
  const pctEl = document.getElementById('hoverGenderPct');

  const existing = Chart.getChart(ctx);
  if (existing) existing.destroy();

  new Chart(ctx, {
    type: 'pie',
    data: {
      labels,
      datasets: [{
        data,
        backgroundColor: labels.map(l => COLORS[l])
      }]
    },
    options: {
      responsive: true,
      plugins: {
        legend: { position: 'right' },
        tooltip: { enabled: false }
      },
      onHover: (evt, els, chart) => {
        if (els.length) {
          const i = els[0].index;
          const sliceColor = COLORS[labels[i]];
          lblEl.textContent = labels[i];
          pctEl.textContent = `${data[i].toFixed(2)}% of defendants`;
          pctEl.style.color = sliceColor;      // match slice colour
        } else {
          lblEl.textContent = '';
          pctEl.textContent = '';
          pctEl.style.color = '';              // reset
        }
      }
    }
  });
}

/* ------------------------------------------------------------------ */
/* RUN                                                                */
/* ------------------------------------------------------------------ */
loadData();