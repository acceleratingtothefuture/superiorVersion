function prettyName(key) {
 const map = {
  all_cases : 'All Cases Received',
  accepted  : 'Accepted Cases',
  rejected  : 'Rejected Cases',

  Filed     : 'Cases Filed by Prosecutor',
  Dismissed : 'Dismissed by Court',
  Rejected  : 'Declined to Prosecute',   // status value, not the new metric
  Open      : 'Open Case',
  Sentenced : 'Sentenced'
};
  return map[key] || key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}


/* --- normaliser helpers --- */
import { cleanCaseRow, cleanDefRow } from '../cleanData.js';

/***** CONSTANTS *****/
const COLORS = [
  '#000', '#e91e63', '#ff9800', '#ffe600ff', '#4caf50',
  '#00bcd4', '#9c27b0', '#f44336', '#3f51b5', '#2196f3', '#795548'
];

const STATUS_TYPES = ['Filed', 'Dismissed', 'Rejected', 'Open', 'Sentenced', 'accepted','rejected'];

const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug',
                     'Sep','Oct','Nov','Dec'];

/***** HOVER BAR PLUGIN *****/
const hoverBar = {
  id: 'hoverBar',
  afterDraw(c) {
    if (c.config.type !== 'line') return;
    const { ctx, tooltip, chartArea } = c;
    if (!tooltip._active?.length) return;
    const x = tooltip._active[0].element.x;
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,.07)';
    ctx.fillRect(x - 18, chartArea.top, 36, chartArea.bottom - chartArea.top);
    ctx.restore();
  }
};
Chart.register(hoverBar);

/* ===== FILE LOCATION ===== */
// while you’re on Live Server, always use the local ./data/ folder
const FOLDER = './data/';                         // ← change this line

// later, when the files live in WordPress, swap it to:
// const FOLDER = '/wp-content/uploads/da-dashboard/';


/* ── data stores ─────────────────────────────── */
const caseRows = [];   // purely case info
const defRows  = [];   // purely defendant info
let rows       = caseRows;   // points at the active set

/* ── visuals ─────────────────────────────────── */
let charts = [], pieChart = null;


let fileChartObj = null;
let sentChartObj = null;


async function discoverYears(type) {
  const base = type === 'defendants' ? 'defendants' : 'cases';
  const found = [];
  const thisYear = new Date().getFullYear();
  for (let y = thisYear; y >= 2015; y--) {
    const head = await fetch(`${FOLDER}${base}_${y}.xlsx`, { method: 'HEAD' });
    if (head.ok) found.push(y);
    else if (found.length) break; // stop at first gap
  }
  return found;
}


/* lazy-load per dataset so they stay TOTALLY distinct */
const loaded = { cases:false, defendants:false };

async function ensureLoaded(dataset) {
  if (loaded[dataset]) return;
  const years = await discoverYears(dataset);
  if (dataset === 'cases') {
    await loadCasesData(years);
  } else {
    await loadDefendantsData(years);
  }
  loaded[dataset] = true;
}

/* initial load (default select is Cases) */
ensureLoaded('cases').then(() => {
  initDimension();
  build();
  initLargeChart();
});

/* read both sheets per year — keep rows separate */
/* read only CASE sheets for given years */
async function loadCasesData(YEARS) {
  for (const y of YEARS) {
    const buf = await fetch(`${FOLDER}cases_${y}.xlsx`).then(r => r.arrayBuffer());
    const wb  = XLSX.read(buf, { type: 'array' });
    const rowsRaw = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '' });

    rowsRaw.forEach(r => {
      const cleaned = cleanCaseRow(r);
      if (!cleaned) return;

      const dt = new Date(cleaned.date_da);
      cleaned.ts      = dt.getTime();
      cleaned.year    = dt.getFullYear();
      cleaned.month   = dt.getMonth() + 1;
      cleaned.quarter = Math.floor(dt.getMonth() / 3) + 1;

      caseRows.push(cleaned);
    });
  }
}

/* read only DEFENDANT sheets for given years  (use date from the defendants file) */
async function loadDefendantsData(YEARS) {
  for (const y of YEARS) {
    const buf = await fetch(`${FOLDER}defendants_${y}.xlsx`).then(r => r.arrayBuffer());
    const wb  = XLSX.read(buf, { type: 'array' });
    const rowsRaw = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '' });

    rowsRaw.forEach(r => {
      const cleaned = cleanDefRow(r);
      if (!cleaned) return;

      // defendants files include the receipt date; use it directly
      const date = r['Case Received By DA'] || r['case received by da'] || r['Case Received'] || r['Case Received Case ID'] || '';
      const dt = new Date(date);

      defRows.push({
        ...cleaned,
        date_da : date,
        ts      : dt.getTime(),
        year    : dt.getFullYear(),
        month   : dt.getMonth() + 1,
        quarter : Math.floor(dt.getMonth() / 3) + 1,
        age_group : (Number.isFinite(cleaned.age) ? cleaned.age : null) == null ? 'Not reported' :
          cleaned.age < 18  ? '<18'  :
          cleaned.age <= 24 ? '18–24' :
          cleaned.age <= 34 ? '25–34' :
          cleaned.age <= 49 ? '35–49' :
          cleaned.age <= 64 ? '50–64' : '65+'
      });
    });
  }
}



/***** CONTROLS *****/
['dataset','metric','range','dimension'].forEach(id =>
  document.getElementById(id).onchange = async (e) => {
    if (id === 'dataset') {
      const mode = document.getElementById('dataset').value; // cases | defendants
      // make sure the right files are loaded, and ONLY those files are used
      await ensureLoaded(mode);
      initDimension(); // refresh dropdown keys based on active store
    }
    build();
  }
);


document.getElementById('pieToggle').onchange = build;

function initDimension() {
  const mode   = document.getElementById('dataset').value;      // cases | defendants
  const sel    = document.getElementById('dimension');
  const ignore = ['case_id','date_da','year','month','quarter','ts',
                  'days_to_file','days_file_to_sent','age'];

  const source = mode === 'cases' ? caseRows[0] : defRows[0];
  let keys     = Object.keys(source).filter(k => !ignore.includes(k));

  if (mode === 'cases') {
    keys = keys.filter(k => !['ethnicity','gender','county_res','age_group'].includes(k));
  } else {
    keys = keys.filter(k =>  ['ethnicity','gender','county_res','age_group'].includes(k));
  }

  sel.innerHTML = keys.map(k =>
    `<option value="${k}">${k.replace(/_/g,' ').replace(/\b\w/g,c=>c.toUpperCase())}</option>`
  ).join('');
}


/***** HELPERS *****/
const keyOf = (y,m,mode) =>
  mode === 'monthly'   ? `${y}-${m}`       :
  mode === 'quarterly' ? `${y}-Q${Math.ceil(m/3)}` :
  mode === 'annual'    ? String(y)          :
                         `${y}-${m}`;
function fmt(v, isCount){
  if (v==null || Number.isNaN(v)) return 'N/A';
  if (!isCount) return v + '%';
  const isCaseMode = document.getElementById('dataset').value === 'cases';
  const unit = isCaseMode ? ' cases' : ' defendants';
  return v + unit;
}

function fadeColor(hex,a=.18){
  const n=parseInt(hex.slice(1),16);
  const r=(n>>16)&255,g=(n>>8)&255,b=n&255;
  return `rgba(${r},${g},${b},${a})`;
}

export { fadeColor };

/***** BUILD DASHBOARD *****/
export function build() {
 /* switch the active rows array */
const isCaseMode = document.getElementById('dataset').value === 'cases';
rows = isCaseMode ? caseRows : defRows;

/* show/hide the Measure picker */
document.getElementById('metric').parentElement.style.display = isCaseMode ? '' : 'none';

  charts.forEach(c => c.destroy());
  charts.length = 0;
  
  if (largeChart) {
    largeChart.data.datasets = [];
    largeChart.data.labels   = [];
    largeChart.update();
    document.getElementById('compareSection').style.display = 'none';
  }

  alasql('DROP TABLE IF EXISTS cases');
  alasql('CREATE TABLE cases');
  alasql('INSERT INTO cases SELECT * FROM ?', [rows]);

   const range   = document.getElementById('range').value;
  const dim     = document.getElementById('dimension').value;

  // Effective metric: defendants ignore the cases metric dropdown
  const metricEl = document.getElementById('metric');
  const metric   = isCaseMode ? metricEl.value : 'all_cases';

  // Pie mode: allow in both datasets, but for cases we only enable pie
  // when the metric is all_cases or a status metric
  const pieMode  = document.getElementById('pieToggle').checked &&
                   (isCaseMode ? (metric === 'all_cases' || STATUS_TYPES.includes(metric)) : true);

  /* buckets */
  const buckets = [];
if (range === 'last12') {
  const maxTs = Math.max(...rows.map(r => r.ts));
  const maxD = new Date(maxTs);
  const startYear = maxD.getFullYear();
  const startMonth = maxD.getMonth(); // 0-based

  for (let i = 11; i >= 0; i--) {
    const offset = startMonth - i;
    const y = startYear + Math.floor(offset / 12);
    const m = (offset % 12 + 12) % 12; // handle negatives

    const label = `${MONTH_NAMES[m]} '${String(y).slice(-2)}`;
    const key = `${y}-${m + 1}`; // m is 0-based

    buckets.push({ y, m: m + 1, label, key });
  }
}

 else if (range === 'monthly') {
  const years = [...new Set(rows.map(r => r.year))].sort((a, b) => a - b);
  years.forEach(year =>
    MONTH_NAMES.forEach((_, i) =>
      buckets.push({
        y: year,
        m: i + 1,
        label: `${MONTH_NAMES[i]} '${String(year).slice(-2)}`,
        key: `${year}-${i + 1}`
      })
    )
  );

} else if (range === 'quarterly') {
  const years = [...new Set(rows.map(r => r.year))].sort((a, b) => a - b);
  years.forEach(year =>
    [1, 2, 3, 4].forEach(q =>
      buckets.push({
        y: year,
        q,
        label: `Q${q} '${String(year).slice(-2)}`,
        key: `${year}-Q${q}`
      })
    )
  );

} else { /* annual */
  const years = [...new Set(rows.map(r => r.year))].sort((a, b) => a - b);
  years.forEach(year =>
    buckets.push({
      y: year,
      label: String(year),
      key: String(year)
    })
  );
}


  /* aggregates */

  const allCounts = {}, statusCounts = {}, groupAll = {}, groupStatus = {};

  rows.forEach(r => {
    const key = keyOf(r.year, r.month, range);
    let g = r[dim];
    if (g === undefined || g === null || g === '') g = 'Unknown';

    // always build the "all" counts
    allCounts[key] = (allCounts[key] || 0) + 1;
    (groupAll[g] ??= {})[key] = (groupAll[g][key] || 0) + 1;

    // ONLY do status buckets in case mode (defendants don’t have r.status)
    if (isCaseMode && r.status) {
      const s = r.status;
      (statusCounts[s] ??= {})[key] = (statusCounts[s][key] || 0) + 1;
      (groupStatus[s] ??= {});
      (groupStatus[s][g] ??= {});
      groupStatus[s][g][key] = (groupStatus[s][g][key] || 0) + 1;
    }
  });


  /* ---------- map every metric to the counts it needs ---------- */
  function metricBuckets(metric){
    // Defendants: always "all"
    if (!isCaseMode) return { bucket: allCounts, group: groupAll };

    switch (metric){
      case 'all_cases':
        return { bucket: allCounts, group: groupAll };

      case 'rejected':
        return { bucket: statusCounts.Rejected || {}, group: groupStatus.Rejected || {} };

      case 'accepted': {
        const bucket = {}, group = {};
        for (const k in allCounts){
          bucket[k] = (allCounts[k] || 0) - (statusCounts.Rejected?.[k] || 0);
        }
        for (const g in groupAll){
          group[g] = {};
          for (const k in groupAll[g]){
            const rej = groupStatus.Rejected?.[g]?.[k] || 0;
            group[g][k] = (groupAll[g][k] || 0) - rej;
          }
        }
        return { bucket, group };
      }

      case 'Sentenced':
      case 'Dismissed':
        return { bucket: statusCounts[metric] || {}, group: groupStatus[metric] || {} };

      default:
        return { bucket:{}, group:{} };
    }
  }



/* which slice are we plotting? */
const {bucket: bucketBase, group: groupBase} = metricBuckets(metric);


// ✅ Remove loading message no matter what rendering path is taken
const loading = document.getElementById('pieLoading');
if (loading) loading.remove();


  if (pieMode) {
    const lineData = buckets.map(b=>bucketBase[b.key]||0);
    renderLinePie(buckets,lineData,groupBase,metric);
    return;

  }

const allLabel = isCaseMode ? 'All Cases' : 'All Defendants';

const datasets = [
  {
    label: allLabel,
    color: '#000',
    values: buckets.map(b => bucketBase[b.key] || 0)
  },
  ...Object.keys(groupBase).map((g,i) => ({
    label: g,
    color: COLORS[(i+1)%COLORS.length],
    values: buckets.map(b => groupBase[g]?.[b.key] || 0)
  }))
];


  render(datasets,buckets.map(b=>b.label),true);
}

/***** RENDER FUNCTIONS (unchanged) *****/
function render(datasets,labels,isCount){
  const grid=document.getElementById('chartGrid');
  grid.innerHTML='';
  charts.forEach(c=>c.destroy());
  charts=[];

  const first=labels[0],last=labels.at(-1);

  datasets.forEach((d,i)=>{
    const id=`c${i}`;
    grid.insertAdjacentHTML('beforeend',`
      <div class="chart-box">
        <div class="chart-head">
          <div class="chart-title">${escapeHtml(d.label)}</div>
          <div class="chart-month" id="m${i}"></div>
        </div>
        <div class="chart-number" id="v${i}">${fmt(d.values.at(-1),isCount)}</div>
        <div class="chart-canvas"><canvas id="${id}" width="280" height="100"></canvas></div>
        <div class="range-labels"><span>${first}</span><span>${last}</span></div>
        <label style="margin-top:8px;display:block;">
          <input type="checkbox" onchange="toggleLargeChart(${i})"> Compare
        </label>
      </div>`);

    const ctx=document.getElementById(id).getContext('2d');
    const chart=new Chart(ctx,{
      type:'line',
      data:{labels,datasets:[{
        label:d.label,data:d.values,
        borderColor:d.color,backgroundColor:d.color,
        tension:.18,pointRadius:0,pointHoverRadius:5
      }]},
      options:{
        responsive:false,animation:false,
        plugins:{legend:{display:false},tooltip:{enabled:false}},
        interaction:{mode:'nearest',axis:'x',intersect:false},
        scales:{x:{display:false},
                y:{beginAtZero:true,ticks:{callback:v=>Number.isInteger(v)?v:''}}},
        onHover:(e,els)=>els.length?hover(els[0].index,labels,isCount):clear(isCount)
      },
      plugins:[hoverBar]
    });
    charts.push(chart);
  });
}

function renderLinePie(buckets, lineData, groupCounts, metricName) {
  const grid = document.getElementById('chartGrid');
  const isCaseMode = document.getElementById('dataset').value === 'cases';
const unitWord   = isCaseMode ? 'cases' : 'defendants';
const titleText  = isCaseMode ? prettyName(metricName) : 'All Defendants';

  //Remove loading message
  const loading = document.getElementById('pieLoading');
  if (loading) loading.remove();

  //Render charts
grid.innerHTML = `
  <div class="chart-box" style="flex:1 1 100%;">
    <div class="chart-head">
      <div class="chart-title">${titleText}</div>
      <div class="chart-month" id="lineMonth"></div>
    </div>
    <div class="chart-number" id="lineValue">${lineData.at(-1)} ${unitWord}</div>
    <canvas id="lineMain" height="140"></canvas>
  </div>
  <div class="chart-box" style="flex:1 1 320px;">
    <div class="chart-head"><div class="chart-title">Breakdown</div></div>
    <div class="chart-number" id="sliceValue"></div>
    <canvas id="pieMain" height="140"></canvas>
  </div>`;

    
  const lineCtx=document.getElementById('lineMain').getContext('2d');
  const pieCtx=document.getElementById('pieMain').getContext('2d');
  const labels=buckets.map(b=>b.label);
  let origColors=[];

  new Chart(lineCtx,{
    type:'line',
    data:{
      labels,
      datasets:[{
        label:metricName,
        data:lineData,
        borderColor:'#000',backgroundColor:'#000',
        tension:.18,pointRadius:0,pointHoverRadius:5
      }]
    },
    options:{
      responsive:true,animation:false,
      plugins:{legend:{display:false},tooltip:{enabled:false}},
      interaction:{mode:'nearest',axis:'x',intersect:false},
      scales:{y:{beginAtZero:true}},
      onHover:(e,els)=>{
        if(!els.length) return;
        const idx=els[0].index;
        updatePie(idx);
        document.getElementById('lineValue').textContent = lineData[idx] + ' ' + unitWord;
        document.getElementById('lineMonth').textContent=labels[idx];
      }
    }
  });

  pieChart=new Chart(pieCtx,{
    type:'pie',
    data:{labels:[],datasets:[{data:[],backgroundColor:[]}]},
    options:{
      plugins:{legend:{position:'right'},tooltip:{enabled:false}},
      onHover:(e,els)=>{
        const box=document.getElementById('sliceValue');
        if(!els.length){
          pieChart.data.datasets[0].backgroundColor=origColors;
          pieChart.update();
          box.textContent='';
          box.style.color='#000';
          return;
        }
        const i=els[0].index;
        const lbl=pieChart.data.labels[i];
        const val=pieChart.data.datasets[0].data[i];
        pieChart.data.datasets[0].backgroundColor=
          origColors.map((c,idx)=>idx===i?c:fadeColor(c));
        pieChart.update();
        box.textContent = `${lbl}: ${val} ${unitWord}`;
        box.style.color=origColors[i];
      }
    }
  });

  function updatePie(idx){
    const key=buckets[idx].key;
    const sliceLabels=[], sliceData=[], sliceColors=[];
    let colorIdx=1;
    Object.keys(groupCounts).forEach(g=>{
      const v=groupCounts[g]?.[key]||0;
      if(!v) return;
      sliceLabels.push(g);
      sliceData.push(v);
      sliceColors.push(COLORS[(colorIdx++)%COLORS.length]);
    });
    origColors=sliceColors.slice();
    pieChart.data.labels=sliceLabels;
    pieChart.data.datasets[0].data=sliceData;
    pieChart.data.datasets[0].backgroundColor=sliceColors;
    pieChart.update();
  }
  updatePie(buckets.length-1);
  document.getElementById('lineMonth').textContent=labels.at(-1);
}

/***** COMPARE CHART *****/
let largeChart=null;
function initLargeChart(){
  const ctx=document.getElementById('largeChart').getContext('2d');
  largeChart=new Chart(ctx,{
    type:'line',
    data:{labels:[],datasets:[]},
    options:{
      responsive:true,
      plugins:{legend:{position:'top'}},
      interaction:{mode:'nearest',axis:'x',intersect:false},
      scales:{y:{beginAtZero:true}}
    }
  });
}
function toggleLargeChart(index){
  const d=charts[index].data.datasets[0];
  const label=d.label;
  const existing=largeChart.data.datasets.find(ds=>ds.label===label);
  if(existing){
    largeChart.data.datasets=largeChart.data.datasets.filter(ds=>ds.label!==label);
  }else{
    largeChart.data.datasets.push({
      label,data:d.data,
      borderColor:d.borderColor,backgroundColor:d.borderColor,
      tension:.18,pointRadius:0,pointHoverRadius:4
    });
    if(!largeChart.data.labels.length){
      largeChart.data.labels=charts[index].data.labels;
    }
  }
  document.getElementById('compareSection').style.display=
    largeChart.data.datasets.length?'block':'none';
  largeChart.update();
  if(!largeChart.data.datasets.length){
    largeChart.data.labels=[];
  }
}

window.toggleLargeChart = toggleLargeChart;

/***** HOVER HELPERS *****/
function hover(i, labels, isCount) {
  charts.forEach((c, idx) => {
    c.setActiveElements([{ datasetIndex: 0, index: i }]);
    c.update();

    const v = c.data.datasets[0].data[i];

    const valEl = document.getElementById('v' + idx);
    const monEl = document.getElementById('m' + idx);

    if (valEl) valEl.textContent = fmt(v, isCount);
    if (monEl) monEl.textContent = labels[i];
  });
}

function clear(isCount){
  charts.forEach((c,idx)=>{
    c.setActiveElements([]);
    c.update();
    const v=c.data.datasets[0].data.at(-1);
    document.getElementById('v'+idx).textContent=fmt(v,isCount);
    document.getElementById('m'+idx).textContent='';
  });
}

/* escape helper to kill XSS */
function escapeHtml(s){
  return String(s)
    .replaceAll('&','&amp;')
    .replaceAll('<','&lt;')
    .replaceAll('>','&gt;')
    .replaceAll('"','&quot;')
    .replaceAll("'",'&#39;');
}

/* ---------------------------------------------------------
   slide buttons (3 panels => 0%, -33.333%, -66.666%)
   --------------------------------------------------------- */
const wrap = document.querySelector('.panel-wrapper');
const buttons = document.querySelectorAll('.view-toggle button');

function activatePanel(index) {
  wrap.style.transform = `translateX(-${index * 33.333}%)`;
  buttons.forEach((b, i) => {
    b.classList.toggle('active', i === index);
  });
}

document.getElementById('toMain').onclick = () => activatePanel(0);
document.getElementById('toStats').onclick = () => activatePanel(1);
document.getElementById('toMonthly').onclick = () => activatePanel(2);

window.build = build;



