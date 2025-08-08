import { cleanCaseRow, cleanDefRow } from '../cleanData.js';

const FOLDER = './data/';
window.caseRows = window.caseRows || [];
const rows = window.caseRows;

function showStatus(msg) {
  const el = document.getElementById('statusMessage');
  if (el) el.textContent = msg;
}

async function discoverYears() {
  const found = [];
  const thisYear = new Date().getFullYear();
  for (let y = thisYear; y >= 2015; y--) {
    try {
      const res = await fetch(`${FOLDER}cases_${y}.xlsx`, { method: 'HEAD' });
      if (res.ok) found.push(y);
      else if (found.length) break;
    } catch {}
  }
  return found;
}

async function loadData(years) {
  for (const y of years) {
    const [bufCases, bufDefs] = await Promise.all([
      fetch(`${FOLDER}cases_${y}.xlsx`).then(r => r.arrayBuffer()),
      fetch(`${FOLDER}defendants_${y}.xlsx`).then(r => r.arrayBuffer())
    ]);
    const wbCases = XLSX.read(bufCases, { type: 'array' });
    const wbDefs = XLSX.read(bufDefs, { type: 'array' });

    const cases = XLSX.utils.sheet_to_json(wbCases.Sheets[wbCases.SheetNames[0]], { defval: '' });
    const defs = XLSX.utils.sheet_to_json(wbDefs.Sheets[wbDefs.SheetNames[0]], { defval: '' });

    const byCase = {};
    defs.forEach(d => {
      const clean = cleanDefRow(d);
      if (clean) byCase[clean.case_id] = clean;
    });

    cases.forEach(c => {
      const cleaned = cleanCaseRow(c);
      if (!cleaned) return;
      const d = byCase[cleaned.case_id] || {};
      const row = {
        ...cleaned,
        ethnicity: d.ethnicity || 'Unknown',
        gender: d.gender || 'Unknown',
        county_res: d.county_res || 'Unknown',
        age: d.age ?? null,
      };
      const dt = new Date(row.date_da);
      row.ts = dt.getTime();
      row.year = dt.getFullYear();
      row.month = dt.getMonth() + 1;
      row.quarter = Math.floor(dt.getMonth() / 3) + 1;
      rows.push(row);
    });
  }
}

const hoverBar = window.hoverBar || {
  id: 'hoverBar',
  afterDraw(chart) {
    if (chart.config.type !== 'line') return;
    const { ctx, tooltip, chartArea } = chart;
    if (!tooltip._active?.length) return;
    const x = tooltip._active[0].element.x;
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.07)';
    ctx.fillRect(x - 18, chartArea.top, 36, chartArea.bottom - chartArea.top);
    ctx.restore();
  }
};
window.hoverBar = hoverBar;
if (window.Chart && !Chart.registry.plugins.get('hoverBar')) {
  Chart.register(hoverBar);
}

function buildCharts() {
  const MONTHS = 12;
  const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  const fileBuckets = Array.from({ length: MONTHS }, () => []);
  const sentBuckets = Array.from({ length: MONTHS }, () => []);

  rows.forEach(({ month, days_to_file, days_file_to_sent }) => {
    const i = month - 1;
    if (typeof days_to_file === 'number' && days_to_file > 0) fileBuckets[i].push(days_to_file);
    if (typeof days_file_to_sent === 'number' && days_file_to_sent > 0) sentBuckets[i].push(days_file_to_sent);
  });

  const avg = arr => arr.map(a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
  const median = arr => {
    if (!arr.length) return null;
    const s = [...arr].sort((a, b) => a - b);
    const mid = Math.floor(s.length / 2);
    return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
  };
  const fade = (hex, alpha) => {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r},${g},${b},${alpha})`;
  };

  const fileAvg = avg(fileBuckets);
  const sentAvg = avg(sentBuckets);
  const fileMed = fileBuckets.map(median);
  const sentMed = sentBuckets.map(median);

  const labels = MONTH_NAMES.map((m, i) => {
    const years = rows.filter(r => r.month === i + 1).map(r => r.year);
    const year = years.length ? Math.max(...years) : null;
    return year ? `${m} '${String(year).slice(-2)}` : m;
  });

  if (!window.charts) window.charts = [];
  window.charts.forEach(c => c?.destroy());
  window.charts.length = 0;

  const makeLine = (idCanvas, idVal, idMonth, data, color) => {
    const ctx = document.getElementById(idCanvas)?.getContext('2d');
    const elVal = document.getElementById(idVal);
    const elMon = document.getElementById(idMonth);
    if (!ctx) return null;

    if (elVal) elVal.textContent = data.at(-1) != null ? data.at(-1).toFixed(1) + ' days' : 'N/A';
    if (elMon) elMon.textContent = '';

    const chart = new Chart(ctx, {
      type: 'line',
      data: {
        labels,
        datasets: [{
          data,
          borderColor: color,
          backgroundColor: fade(color, 0.3),
          tension: 0.2,
          pointRadius: 0,
          pointHoverRadius: 5,
          fill: false
        }]
      },
      options: {
        responsive: false,
        animation: false,
        plugins: {
          legend: { display: false },
          tooltip: { enabled: false }
        },
        interaction: {
          mode: 'nearest',
          axis: 'x',
          intersect: false
        },
        scales: {
          x: { display: false },
          y: {
            beginAtZero: true,
            ticks: {
              callback: v => Number.isInteger(v) ? v : ''
            }
          }
        },
        onHover: (event, elements) => {
          const idx = elements.length ? elements[0].index : null;
          if (idx != null) {
            chart.setActiveElements([{ datasetIndex: 0, index: idx }]);
            if (elVal) elVal.textContent = data[idx] != null ? data[idx].toFixed(1) + ' days' : 'N/A';
            if (elMon) elMon.textContent = chart.data.labels[idx];
          } else {
            chart.setActiveElements([]);
            if (elVal) elVal.textContent = data.at(-1) != null ? data.at(-1).toFixed(1) + ' days' : 'N/A';
            if (elMon) elMon.textContent = '';
          }
          chart.update();
        }
      },
      plugins: [hoverBar]
    });
    return chart;
  };

  window.charts.push(
    makeLine('fileChart', 'fileValue', 'fileMonth', fileAvg, '#2196f3'),
    makeLine('sentChart', 'sentValue', 'sentMonth', sentAvg, '#e91e63'),
    makeLine('fileMedianChart', 'fileMedianValue', 'fileMedianMonth', fileMed, '#1976d2'),
    makeLine('sentMedianChart', 'sentMedianValue', 'sentMedianMonth', sentMed, '#c2185b')
  );
  
}

async function main() {
  showStatus('Discovering data...');
  try {
    const years = await discoverYears();
    if (!years.length) {
      showStatus('No data files found.');
      return;
    }

    const latestYear = Math.max(...years);
document.getElementById('caseProcessYear').textContent = `(${latestYear})`;

await loadData([latestYear]);


    showStatus('Rendering charts...');
    buildCharts();
  } catch (err) {
    console.error('Error:', err);
    showStatus('Failed to load charts.');
  }
}

window.addEventListener('DOMContentLoaded', () => {
  if (!window.Chart) {
    showStatus('Chart.js not loaded.');
    return;
  }
  main();
});