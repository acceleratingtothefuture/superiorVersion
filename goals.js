const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const caseData = {
  labels: MONTH_NAMES,
  data2023: [200, 210, 250, 230, 270, 290, 310, 280, 260, 240, 230, 250],
  data2024: [220, 225, 260, 245, 275, 300, 320, 290, 270, 260, 250, 270]
};

const outerRegionData = {
  labels: MONTH_NAMES,
  data2023: [12, 14, 11, 10, 15, 17, 18, 16, 13, 11, 10, 12],
  data2024: [14, 15, 13, 12, 16, 20, 21, 19, 17, 14, 13, 15]
};

function makeBigLine(canvasId, labelId, val23Id, val24Id, diffId, data2023, data2024, label2023, label2024, color2023, color2024) {
  const ctx = document.getElementById(canvasId).getContext('2d');
  const elLabel = document.getElementById(labelId);
  const el2023 = document.getElementById(val23Id);
  const el2024 = document.getElementById(val24Id);
  const elDiff  = document.getElementById(diffId);

  new Chart(ctx, {
    type: 'line',
    data: {
      labels: MONTH_NAMES,
      datasets: [
        {
          label: label2023,
          data: data2023,
          borderColor: color2023,
          backgroundColor: color2023 + '33',
          tension: 0.4,
          fill: false,
          pointRadius: 5
        },
        {
          label: label2024,
          data: data2024,
          borderColor: color2024,
          backgroundColor: color2024 + '33',
          tension: 0.4,
          fill: false,
          pointRadius: 5
        }
      ]
    },
    options: {
      responsive: true,
      plugins: {
        legend: {
          display: true,
          position: 'top'
        },
        tooltip: {
          enabled: false
        }
      },
      interaction: {
        mode: 'nearest',
        axis: 'x',
        intersect: false
      },
      onHover: (event, chartEls) => {
        const points = chartEls;
        if (points.length > 0) {
          const i = points[0].index;
          const month = MONTH_NAMES[i];
          const v23 = data2023[i];
          const v24 = data2024[i];
          const delta = v24 - v23;

          elLabel.textContent = month;
          el2023.textContent = isFinite(v23) ? Math.round(v23) : '—';
          el2024.textContent = isFinite(v24) ? Math.round(v24) : '—';

          if (isFinite(delta)) {
            elDiff.textContent = (delta >= 0 ? '+' : '') + Math.round(delta);
            elDiff.className = delta >= 0 ? 'diff-up' : 'diff-down';
          } else {
            elDiff.textContent = '—';
            elDiff.className = '';
          }
        }
      },
      scales: {
        y: {
          beginAtZero: true
        }
      }
    }
  });
}

// Build both charts
makeBigLine(
  'casesFiledChart',
  'monthLabel1',
  'val2023',
  'val2024',
  'valDiff',
  caseData.data2023,
  caseData.data2024,
  '2023',
  '2024',
  '#007acc',
  '#ff6600'
);

makeBigLine(
  'outerRegionChart',
  'monthLabel2',
  'val2023Outer',
  'val2024Outer',
  'valDiffOuter',
  outerRegionData.data2023,
  outerRegionData.data2024,
  '2023',
  '2024',
  '#2c974b',
  '#c0392b'
);