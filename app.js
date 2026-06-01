/* ════════════════════════════════════════════════
   Financial Life Calculator
   Pure math is exposed on window.Calc for testing.
   DOM wiring sits at the bottom and no-ops if elements
   are missing (so tests.html can load this file).
   ════════════════════════════════════════════════ */

// ── PURE MATH ──────────────────────────────────────
const Calc = {
  // Monthly mortgage payment (principal + interest only)
  pmt(loan, annualRate, years) {
    const r = annualRate / 100 / 12;
    const n = years * 12;
    if (r === 0) return loan / n;
    return loan * r * Math.pow(1 + r, n) / (Math.pow(1 + r, n) - 1);
  },

  // Full amortization schedule
  mortgageSchedule(loan, annualRate, years) {
    const pmt = Calc.pmt(loan, annualRate, years);
    const r = annualRate / 100 / 12;
    const n = years * 12;
    const sched = [];
    let bal = loan;
    for (let i = 1; i <= n; i++) {
      const intP = bal * r;
      const prinP = pmt - intP;
      bal = Math.max(0, bal - prinP);
      sched.push({ m: i, principal: prinP, interest: intP, balance: bal });
    }
    return { pmt, sched };
  },

  // Compound interest with monthly contributions
  compound(principal, annualRate, years, monthlyContribution) {
    const r = annualRate / 100;
    const series = [];
    for (let y = 0; y <= years; y++) {
      const c = principal + monthlyContribution * 12 * y;
      // closed-form: P(1+r)^y + C*12*((1+r)^y - 1)/r
      const b = r === 0
        ? principal + monthlyContribution * 12 * y
        : principal * Math.pow(1 + r, y) + monthlyContribution * 12 * ((Math.pow(1 + r, y) - 1) / r);
      series.push({ year: y, contributed: c, balance: b, interest: b - c });
    }
    return series;
  },

  // Rent vs Buy — apples-to-apples: whichever party has higher monthly
  // outflow, the OTHER party invests the difference. Includes selling cost.
  rentVsBuy(opts) {
    const {
      homePrice, monthlyRent, mortgageRate, downPct,
      apprPct, rentIncreasePct, investReturnPct, years,
      propTaxPct = 1.2, insPct = 0.5, maintPct = 1.0, sellCostPct = 6.0,
    } = opts;

    const downAmt = homePrice * downPct / 100;
    const loan = homePrice - downAmt;
    const pmt = Calc.pmt(loan, mortgageRate, 30);
    const r = mortgageRate / 100 / 12;

    // Monthly carrying costs beyond P&I
    const monthlyExtra = homePrice * (propTaxPct + insPct + maintPct) / 100 / 12;
    const buyMonthly = pmt + monthlyExtra;

    let homeVal = homePrice;
    let mortBal = loan;
    let buyExtraPortfolio = 0; // buyer's investments when they pay LESS than rent
    let rentPortfolio = downAmt; // renter starts by investing the down payment
    let curRent = monthlyRent;
    let buyTotal = downAmt;
    let rentTotal = 0;

    const labels = [], buyNW = [], rentNW = [];

    for (let y = 1; y <= years; y++) {
      // 12 months of buy-side mortgage amortization
      for (let m = 0; m < 12; m++) {
        const intP = mortBal * r;
        const prinP = pmt - intP;
        mortBal = Math.max(0, mortBal - prinP);
      }
      homeVal *= (1 + opts.apprPct / 100);
      buyTotal += buyMonthly * 12;
      rentTotal += curRent * 12;

      // Whichever party pays MORE this year, the OTHER invests the difference (monthly).
      const monthlyDiff = buyMonthly - curRent;
      const annualReturn = 1 + investReturnPct / 100;

      if (monthlyDiff > 0) {
        // Renter pays less → renter invests the savings
        rentPortfolio = rentPortfolio * annualReturn + monthlyDiff * 12;
        buyExtraPortfolio = buyExtraPortfolio * annualReturn;
      } else {
        // Buyer pays less → buyer invests the savings
        buyExtraPortfolio = buyExtraPortfolio * annualReturn + (-monthlyDiff) * 12;
        rentPortfolio = rentPortfolio * annualReturn;
      }

      // Net worth: buyer = home equity (after selling cost) + their portfolio
      //            renter = portfolio
      const netHomeValue = homeVal * (1 - sellCostPct / 100);
      const equity = netHomeValue - mortBal;
      buyNW.push(Math.round(equity + buyExtraPortfolio));
      rentNW.push(Math.round(rentPortfolio));

      labels.push('Yr ' + y);
      curRent *= (1 + rentIncreasePct / 100);
    }

    return {
      labels, buyNW, rentNW,
      buyTotal, rentTotal,
      finalBuyNW: buyNW[buyNW.length - 1] || 0,
      finalRentNW: rentNW[rentNW.length - 1] || 0,
    };
  },

  // Retirement: accumulation + decumulation with inflation on spending
  retirement(opts) {
    const { currentAge, retireAge, savedNow, monthlyContribution,
            annualReturn, monthlySpend, inflationPct = 2.5 } = opts;

    const years = Math.max(1, retireAge - currentAge);
    const r = annualReturn / 100;
    let bal = savedNow;
    const labels = [], contrib = [], growth = [];

    for (let y = 1; y <= years; y++) {
      bal = bal * (1 + r) + monthlyContribution * 12;
      const totalContrib = savedNow + monthlyContribution * 12 * y;
      labels.push(String(currentAge + y));
      contrib.push(Math.round(totalContrib));
      growth.push(Math.round(Math.max(0, bal - totalContrib)));
    }

    const projected = bal;
    const safeMonthly = projected * 0.04 / 12;
    const needed = monthlySpend * 12 / 0.04;

    // Decumulation with monthly compounding AND inflation-adjusted spending
    let drawBal = projected;
    let monthlySpendInflated = monthlySpend;
    const mRate = annualReturn / 100 / 12;
    const mInfl = inflationPct / 100 / 12;
    let months = 0;
    while (drawBal > 0 && months < 720) { // 60 years cap
      drawBal = drawBal * (1 + mRate) - monthlySpendInflated;
      monthlySpendInflated *= (1 + mInfl);
      months++;
    }
    const lastsYears = months >= 720 ? '60+ years' : Math.floor(months / 12) + 'y ' + (months % 12) + 'mo';

    return { projected, safeMonthly, needed, lastsYears, labels, contrib, growth };
  },

  // Multi-debt payoff: snowball (smallest balance) or avalanche (highest rate)
  debtPayoff(debts, extra, strategy) {
    const active = debts.map(d => ({ ...d, balance: d.balance }));
    let months = 0, totalInt = 0;
    const balanceHistory = [];
    const sumBal = () => active.reduce((s, d) => s + Math.max(0, d.balance), 0);

    // Sanity: do total min payments exceed total monthly interest at start?
    const startInt = active.reduce((s, d) => s + d.balance * (d.rate / 100 / 12), 0);
    const startMin = active.reduce((s, d) => s + d.minPay, 0);
    if (startMin + extra <= startInt) {
      return { months: Infinity, totalInt: Infinity, balanceHistory: [sumBal()] };
    }

    while (active.some(d => d.balance > 0) && months < 1200) {
      balanceHistory.push(sumBal());

      // Accrue interest
      for (const d of active) {
        if (d.balance > 0) {
          const intP = d.balance * (d.rate / 100 / 12);
          d.balance += intP;
          totalInt += intP;
        }
      }

      // Apply minimum payments + collect freed-up minimums into extra
      let availableExtra = extra;
      for (const d of active) {
        if (d.balance > 0) {
          const pay = Math.min(d.minPay, d.balance);
          d.balance -= pay;
        } else {
          availableExtra += d.minPay;
        }
      }

      // Pour extra into target debt
      const ordered = active.filter(d => d.balance > 0).sort((a, b) =>
        strategy === 'avalanche' ? b.rate - a.rate : a.balance - b.balance
      );
      for (const target of ordered) {
        if (availableExtra <= 0) break;
        const pay = Math.min(availableExtra, target.balance);
        target.balance -= pay;
        availableExtra -= pay;
      }

      months++;
    }
    balanceHistory.push(sumBal());
    return { months, totalInt, balanceHistory };
  },

  // Home affordability: max home price under 28/36 DTI rule.
  // Binary search because PMI flips on/off at 20% down.
  affordability(opts) {
    const { grossMonthlyIncome, monthlyDebts, downCash, mortgageRate,
            propTaxPct = 1.2, insPct = 0.5, pmiPct = 0.8, term = 30 } = opts;

    const maxFront = grossMonthlyIncome * 0.28;
    const maxBack = grossMonthlyIncome * 0.36 - monthlyDebts;
    const maxHousing = Math.min(maxFront, maxBack);
    if (maxHousing <= 0) return { maxPrice: 0, maxHousing: 0, maxFront, maxBack, piti: 0, loan: 0, downPct: 0 };

    const pitiAt = (price) => {
      const down = Math.min(downCash, price);
      const loan = price - down;
      const downPct = price > 0 ? down / price * 100 : 0;
      const pmt = Calc.pmt(loan, mortgageRate, term);
      const tax = price * propTaxPct / 100 / 12;
      const ins = price * insPct / 100 / 12;
      const pmi = downPct < 20 ? loan * pmiPct / 100 / 12 : 0;
      return { piti: pmt + tax + ins + pmi, loan, downPct };
    };

    // Binary search for max price where piti <= maxHousing
    let lo = downCash, hi = downCash + maxHousing * 12 * term * 1.5;
    for (let i = 0; i < 60; i++) {
      const mid = (lo + hi) / 2;
      if (pitiAt(mid).piti > maxHousing) hi = mid;
      else lo = mid;
    }
    const maxPrice = lo;
    const { piti, loan, downPct } = pitiAt(maxPrice);
    return { maxPrice, maxHousing, maxFront, maxBack, piti, loan, downPct };
  },
};
if (typeof window !== 'undefined') window.Calc = Calc;

// ── FORMATTERS / DOM HELPERS ────────────────────────
const fmt = v => '$' + Math.round(v).toLocaleString();
const fmtk = v => v >= 1000000 ? '$' + (v/1000000).toFixed(1)+'M'
                : v >= 1000 ? '$' + (v/1000).toFixed(0)+'k'
                : '$' + Math.round(v);
// Smart rate formatter: keeps user-typed precision up to 3 decimals, strips trailing zeros
const fmtRate = v => {
  if (!isFinite(v)) return '—';
  const s = (Math.round(v * 1000) / 1000).toString();
  return s + '%';
};
const $ = id => document.getElementById(id);

// Read a slider's effective value — prefers the number input (which can hold ANY decimal,
// even values off the slider's step/range) over the range itself. Paste-friendly:
// strips $, commas, %, and whitespace.
const val = id => {
  const num = $(id + '-num');
  if (num) {
    const cleaned = String(num.value).replace(/[$,\s%]/g, '');
    if (cleaned !== '' && cleaned !== '-' && cleaned !== '.') {
      const v = parseFloat(cleaned);
      if (!isNaN(v)) return v;
    }
  }
  const range = $(id);
  return range ? parseFloat(range.value) : 0;
};

// ── ANALYTICS (PostHog) ──────────────────────────────
// To enable: set window.POSTHOG_KEY before this script loads,
// or replace the placeholder string below with your project key.
const POSTHOG_KEY = (typeof window !== 'undefined' && window.POSTHOG_KEY) || 'PLACEHOLDER_REPLACE_ME';
function track(event, props) {
  if (typeof posthog !== 'undefined' && POSTHOG_KEY !== 'PLACEHOLDER_REPLACE_ME') {
    try { posthog.capture(event, props); } catch (e) { /* noop */ }
  }
}

// ── CHART HELPERS (update-in-place when possible) ────
const charts = {};
function renderChart(id, type, data, options) {
  const el = $(id);
  if (!el) return;
  const existing = charts[id];
  if (existing && existing.config.type === type) {
    existing.data = data;
    if (options) existing.options = options;
    existing.update('none');
    return;
  }
  if (existing) existing.destroy();
  charts[id] = new Chart(el.getContext('2d'), { type, data, options });
}

const gridColor = 'rgba(255,255,255,0.07)';
const tickStyle = { color: '#88887f', font: { size: 11, family: 'DM Mono' } };

// ── PANEL SWITCHING (with keyboard nav) ──────────────
const PANELS = ['mortgage', 'rentvbuy', 'compound', 'retirement', 'debt', 'affordability'];
const PANEL_TITLES = {
  mortgage: 'Mortgage Calculator',
  rentvbuy: 'Rent vs. Buy',
  compound: 'Compound Interest',
  retirement: 'Retirement Planner',
  debt: 'Debt Payoff',
  affordability: 'Home Affordability',
};
let activePanel = 'mortgage';

function showPanel(name) {
  if (!PANELS.includes(name)) name = 'mortgage';
  activePanel = name;
  document.querySelectorAll('.calc-panel').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-tab').forEach(t => {
    const isActive = t.id === 'tab-' + name;
    t.setAttribute('aria-selected', isActive ? 'true' : 'false');
    t.setAttribute('tabindex', isActive ? '0' : '-1');
  });
  const panel = $('panel-' + name);
  if (panel) panel.classList.add('active');
  if (PANEL_TITLES[name]) document.title = PANEL_TITLES[name] + ' | Yannett Real Estate Advisors';
  updateURL();
  track('panel_view', { panel: name });
}

function setupTabKeyboardNav() {
  const tabs = Array.from(document.querySelectorAll('.nav-tab'));
  tabs.forEach((tab, idx) => {
    tab.addEventListener('keydown', e => {
      let next = null;
      if (e.key === 'ArrowRight') next = tabs[(idx + 1) % tabs.length];
      else if (e.key === 'ArrowLeft') next = tabs[(idx - 1 + tabs.length) % tabs.length];
      else if (e.key === 'Home') next = tabs[0];
      else if (e.key === 'End') next = tabs[tabs.length - 1];
      if (next) {
        e.preventDefault();
        next.focus();
        const name = next.id.replace('tab-', '');
        showPanel(name);
      }
    });
  });
}

// ── SLIDER ↔ NUMBER INPUT TWO-WAY BIND ───────────────
// The number input is the source of truth for the math. It accepts any decimal,
// not constrained by the slider's step/min/max. The slider tracks the typed value
// visually; if the typed value is outside the slider's range, the slider pins
// to its nearest extreme but the math still uses the typed value.
function bindRangeNum(rangeId) {
  const range = $(rangeId);
  const num = $(rangeId + '-num');
  if (!range || !num) return;
  // Switch to text + decimal inputmode so users can paste "$1,234.50" or "6.5%"
  // (type="number" would silently reject those). Mobile gets the decimal keypad.
  num.type = 'text';
  num.setAttribute('inputmode', 'decimal');
  num.setAttribute('autocomplete', 'off');
  num.removeAttribute('step');
  num.removeAttribute('min');
  num.removeAttribute('max');
  num.value = range.value;

  // When the user drags the slider, mirror to the number input.
  // Only respond to trusted (real) input events — synthetic dispatch from the
  // number input handler must NOT overwrite what the user typed.
  range.addEventListener('input', e => {
    if (e.isTrusted) num.value = range.value;
  });

  // When the user types in the number input, mirror to the slider (which may
  // clamp/snap) and trigger downstream recalc. val() reads num.value, so the
  // calc still uses the typed value exactly. Strip $, commas, %, whitespace
  // so pasted values like "$1,234.50" or "6.5%" parse cleanly.
  num.addEventListener('input', () => {
    const cleaned = String(num.value).replace(/[$,\s%]/g, '');
    const v = parseFloat(cleaned);
    if (isNaN(v)) return;
    // Temporarily let the range accept any value, then restore its step
    const origStep = range.step;
    range.step = 'any';
    range.value = v;
    range.step = origStep;
    range.dispatchEvent(new Event('input')); // synthetic → won't clobber num
  });
}

// ════════════════════════════════════════════════
// COMPOUND INTEREST
// ════════════════════════════════════════════════
function ciUpdate() {
  if (!$('ci-principal')) return;
  const P = val('ci-principal');
  const r = val('ci-rate');
  const Y = val('ci-years');
  const m = val('ci-monthly');

  $('ci-principal-out').textContent = fmt(P);
  $('ci-rate-out').textContent = fmtRate(r);
  $('ci-years-out').textContent = Y + ' years';
  $('ci-monthly-out').textContent = m === 0 ? '$0/mo' : fmt(m) + '/mo';

  const series = Calc.compound(P, r, Y, m);
  const labels = series.map(s => s.year === 0 ? 'Now' : 'Yr ' + s.year);
  const contrib = series.map(s => Math.round(s.contributed));
  const interest = series.map(s => Math.round(s.interest));
  const final = series[series.length - 1];

  $('ci-final').textContent = fmt(final.balance);
  $('ci-contrib').textContent = fmt(final.contributed);
  $('ci-interest').textContent = fmt(final.interest);

  renderChart('ci-chart', 'bar', {
    labels,
    datasets: [
      { label: 'Contributions', data: contrib, backgroundColor: '#4a4540', stack: 'a' },
      { label: 'Interest', data: interest, backgroundColor: '#c9a227', stack: 'a' },
    ],
  }, {
    responsive: true, maintainAspectRatio: false,
    plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => ' ' + fmt(c.raw) } } },
    scales: {
      x: { stacked: true, ticks: { ...tickStyle, autoSkip: true, maxTicksLimit: 12 }, grid: { display: false } },
      y: { stacked: true, ticks: { ...tickStyle, callback: fmtk }, grid: { color: gridColor } },
    },
  });
}

// ════════════════════════════════════════════════
// MORTGAGE (with PITI + optional PMI)
// ════════════════════════════════════════════════
let mgCurrentTab = 'amort';
function mgTab(t) {
  mgCurrentTab = t;
  $('mg-tab-amort').className = 'inner-tab' + (t === 'amort' ? ' active' : '');
  $('mg-tab-split').className = 'inner-tab' + (t === 'split' ? ' active' : '');
  $('mg-legend-amort').style.display = t === 'amort' ? '' : 'none';
  $('mg-legend-split').style.display = t === 'split' ? '' : 'none';
  mgBuildChart();
}

let mgData = {};
function mgUpdate() {
  if (!$('mg-price')) return;
  const price = val('mg-price');
  const downPct = val('mg-down');
  const rate = val('mg-rate');
  const term = val('mg-term');
  const taxPct = val('mg-tax');
  const insPct = val('mg-ins');

  const downAmt = price * downPct / 100;
  const loan = price - downAmt;

  $('mg-price-out').textContent = fmt(price);
  $('mg-down-out').textContent = fmtRate(downPct).replace('%', '%') + ' — ' + fmt(downAmt);
  $('mg-rate-out').textContent = fmtRate(rate);
  $('mg-term-out').textContent = term + ' years';
  $('mg-tax-out').textContent = fmtRate(taxPct) + '/yr';
  $('mg-ins-out').textContent = fmtRate(insPct) + '/yr';

  const { pmt, sched } = Calc.mortgageSchedule(loan, rate, term);
  const monthlyTax = price * taxPct / 100 / 12;
  const monthlyIns = price * insPct / 100 / 12;
  const monthlyPMI = downPct < 20 ? loan * 0.008 / 12 : 0; // ~0.8%/yr typical
  const totalMonthly = pmt + monthlyTax + monthlyIns + monthlyPMI;
  const totalPaid = pmt * term * 12;
  const totalInterest = totalPaid - loan;

  $('mg-monthly').textContent = fmt(totalMonthly);
  $('mg-pi').textContent = fmt(pmt);
  $('mg-pmi').textContent = monthlyPMI > 0 ? fmt(monthlyPMI) : '—';
  $('mg-tinterest').textContent = fmt(totalInterest);
  $('mg-total').textContent = fmt(totalPaid);

  mgData = { pmt, sched, loan, term };
  mgBuildChart();
}

function mgBuildChart() {
  const { pmt, sched } = mgData;
  if (!pmt || !$('mg-chart')) return;

  if (mgCurrentTab === 'amort') {
    const yrs = {};
    sched.forEach(p => {
      const y = Math.ceil(p.m / 12);
      if (!yrs[y]) yrs[y] = { p: 0, i: 0, b: 0 };
      yrs[y].p += p.principal; yrs[y].i += p.interest; yrs[y].b = p.balance;
    });
    const entries = Object.entries(yrs);
    renderChart('mg-chart', 'bar', {
      labels: entries.map(([y]) => 'Yr ' + y),
      datasets: [
        { label: 'Principal', data: entries.map(([, v]) => Math.round(v.p)), backgroundColor: '#7ab0c8', stack: 'a', yAxisID: 'y' },
        { label: 'Interest', data: entries.map(([, v]) => Math.round(v.i)), backgroundColor: '#c9a227', stack: 'a', yAxisID: 'y' },
        { label: 'Balance', data: entries.map(([, v]) => Math.round(v.b)), type: 'line', borderColor: '#f0ece3', backgroundColor: 'rgba(240,236,227,0.05)', pointRadius: 0, yAxisID: 'y2', tension: 0.3 },
      ],
    }, {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => ' ' + fmt(c.raw) } } },
      scales: {
        x: { stacked: true, ticks: { ...tickStyle, autoSkip: true, maxTicksLimit: 10 }, grid: { display: false } },
        y: { stacked: true, position: 'left', ticks: { ...tickStyle, callback: fmtk }, grid: { color: gridColor } },
        y2: { position: 'right', ticks: { ...tickStyle, callback: fmtk, color: '#f0ece3' }, grid: { display: false } },
      },
    });
  } else {
    const step = Math.max(1, Math.floor(sched.length / 60));
    const labs = [], prn = [], intr = [];
    for (let i = 0; i < sched.length; i += step) {
      labs.push('Yr ' + (sched[i].m / 12).toFixed(1));
      prn.push(Math.round(sched[i].principal));
      intr.push(Math.round(sched[i].interest));
    }
    renderChart('mg-chart', 'line', {
      labels: labs,
      datasets: [
        { label: 'Principal', data: prn, borderColor: '#7ab0c8', backgroundColor: 'rgba(122,176,200,0.1)', fill: true, pointRadius: 0, tension: 0.4 },
        { label: 'Interest', data: intr, borderColor: '#c9a227', backgroundColor: 'rgba(201,162,39,0.1)', fill: true, pointRadius: 0, tension: 0.4 },
      ],
    }, {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => ' ' + fmt(c.raw) } } },
      scales: {
        x: { ticks: { ...tickStyle, autoSkip: true, maxTicksLimit: 10 }, grid: { display: false } },
        y: { ticks: { ...tickStyle, callback: fmtk }, grid: { color: gridColor } },
      },
    });
  }
}

// ════════════════════════════════════════════════
// RENT VS BUY (proper apples-to-apples + selling costs)
// ════════════════════════════════════════════════
function rvbUpdate() {
  if (!$('rvb-price')) return;
  const homePrice = val('rvb-price');
  const monthlyRent = val('rvb-rent');
  const mortgageRate = val('rvb-rate');
  const downPct = val('rvb-down');
  const apprPct = val('rvb-appr');
  const rentIncreasePct = val('rvb-rinc');
  const investReturnPct = val('rvb-inv');
  const years = val('rvb-years');

  $('rvb-price-out').textContent = fmt(homePrice);
  $('rvb-rent-out').textContent = fmt(monthlyRent) + '/mo';
  $('rvb-rate-out').textContent = fmtRate(mortgageRate);
  $('rvb-down-out').textContent = fmtRate(downPct);
  $('rvb-appr-out').textContent = fmtRate(apprPct) + '/yr';
  $('rvb-rinc-out').textContent = fmtRate(rentIncreasePct) + '/yr';
  $('rvb-inv-out').textContent = fmtRate(investReturnPct) + '/yr';
  $('rvb-years-out').textContent = years + ' years';

  const r = Calc.rentVsBuy({
    homePrice, monthlyRent, mortgageRate, downPct,
    apprPct, rentIncreasePct, investReturnPct, years,
  });

  const diff = r.finalBuyNW - r.finalRentNW;
  const winner = diff > 0 ? 'buying' : 'renting';
  const absDiff = fmt(Math.abs(diff));

  $('rvb-verdict').innerHTML =
    `After <strong>${years} years</strong>, <strong>${winner}</strong> comes out ahead by <strong>${absDiff}</strong> in net worth. ` +
    (winner === 'buying'
      ? 'Home equity (net of ~6% selling costs) plus appreciation outpace the renter\'s investments.'
      : 'Investing the down payment and monthly savings beats the equity built (after selling costs).');

  $('rvb-buy-nw').textContent = fmt(r.finalBuyNW);
  $('rvb-rent-nw').textContent = fmt(r.finalRentNW);
  $('rvb-buy-cost').textContent = fmt(r.buyTotal);
  $('rvb-rent-cost').textContent = fmt(r.rentTotal);

  renderChart('rvb-chart', 'line', {
    labels: r.labels,
    datasets: [
      { label: 'Buy NW', data: r.buyNW, borderColor: '#c9a227', backgroundColor: 'rgba(201,162,39,0.1)', fill: true, pointRadius: 0, tension: 0.3 },
      { label: 'Rent NW', data: r.rentNW, borderColor: '#f0ece3', backgroundColor: 'rgba(240,236,227,0.05)', fill: true, pointRadius: 0, tension: 0.3 },
    ],
  }, {
    responsive: true, maintainAspectRatio: false,
    plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => ' ' + fmt(c.raw) } } },
    scales: {
      x: { ticks: { ...tickStyle, autoSkip: true, maxTicksLimit: 10 }, grid: { display: false } },
      y: { ticks: { ...tickStyle, callback: fmtk }, grid: { color: gridColor } },
    },
  });
}

// ════════════════════════════════════════════════
// RETIREMENT (with inflation on spending)
// ════════════════════════════════════════════════
function retUpdate() {
  if (!$('ret-age')) return;
  const opts = {
    currentAge: val('ret-age'),
    retireAge: val('ret-retage'),
    savedNow: val('ret-saved'),
    monthlyContribution: val('ret-contrib'),
    annualReturn: val('ret-rate'),
    monthlySpend: val('ret-spend'),
    inflationPct: val('ret-infl'),
  };

  $('ret-age-out').textContent = opts.currentAge;
  $('ret-retage-out').textContent = opts.retireAge;
  $('ret-saved-out').textContent = fmt(opts.savedNow);
  $('ret-contrib-out').textContent = fmt(opts.monthlyContribution) + '/mo';
  $('ret-rate-out').textContent = fmtRate(opts.annualReturn);
  $('ret-spend-out').textContent = fmt(opts.monthlySpend) + '/mo';
  $('ret-infl-out').textContent = fmtRate(opts.inflationPct) + '/yr';

  const r = Calc.retirement(opts);

  $('ret-projected').textContent = fmt(r.projected);
  $('ret-years').textContent = r.lastsYears;
  $('ret-safe').textContent = fmt(r.safeMonthly) + '/mo';
  $('ret-needed').textContent = fmt(r.needed);

  renderChart('ret-chart', 'bar', {
    labels: r.labels,
    datasets: [
      { label: 'Contributions', data: r.contrib, backgroundColor: '#4a4540', stack: 'a' },
      { label: 'Growth', data: r.growth, backgroundColor: '#c9a227', stack: 'a' },
    ],
  }, {
    responsive: true, maintainAspectRatio: false,
    plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => ' ' + fmt(c.raw) } } },
    scales: {
      x: { stacked: true, ticks: { ...tickStyle, autoSkip: true, maxTicksLimit: 12 }, grid: { display: false } },
      y: { stacked: true, ticks: { ...tickStyle, callback: fmtk }, grid: { color: gridColor } },
    },
  });
}

// ════════════════════════════════════════════════
// DEBT PAYOFF (multi-debt with snowball/avalanche)
// ════════════════════════════════════════════════
let debtRows = [
  { name: 'Credit card', balance: 6000, rate: 22, minPay: 150 },
  { name: 'Car loan', balance: 14000, rate: 7, minPay: 300 },
];
let dtStrategy = 'avalanche';

function renderDebtRows() {
  const container = $('dt-debt-list');
  if (!container) return;
  container.innerHTML = '';
  debtRows.forEach((d, i) => {
    const row = document.createElement('div');
    row.className = 'debt-row';
    row.innerHTML = `
      <div class="field-name">
        <span class="field-label">Name</span>
        <input type="text" value="${d.name}" data-i="${i}" data-k="name" aria-label="Debt ${i+1} name">
      </div>
      <div>
        <span class="field-label">Balance</span>
        <input type="number" value="${d.balance}" min="0" step="100" data-i="${i}" data-k="balance" aria-label="Debt ${i+1} balance">
      </div>
      <div>
        <span class="field-label">APR %</span>
        <input type="number" value="${d.rate}" min="0" max="40" step="0.1" data-i="${i}" data-k="rate" aria-label="Debt ${i+1} APR">
      </div>
      <div>
        <span class="field-label">Min/mo</span>
        <input type="number" value="${d.minPay}" min="0" step="10" data-i="${i}" data-k="minPay" aria-label="Debt ${i+1} minimum payment">
      </div>
      <button class="remove-btn" data-i="${i}" aria-label="Remove debt ${i+1}" title="Remove">×</button>
    `;
    container.appendChild(row);
  });

  container.querySelectorAll('input').forEach(inp => {
    inp.addEventListener('input', e => {
      const i = +inp.dataset.i, k = inp.dataset.k;
      debtRows[i][k] = k === 'name' ? inp.value : +inp.value || 0;
      dtUpdate();
    });
  });
  container.querySelectorAll('.remove-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const i = +btn.dataset.i;
      if (debtRows.length <= 1) return;
      debtRows.splice(i, 1);
      renderDebtRows();
      dtUpdate();
    });
  });
}

function dtUpdate() {
  if (!$('dt-extra')) return;
  const extra = val('dt-extra');
  $('dt-extra-out').textContent = fmt(extra) + '/mo';

  const stratResult = Calc.debtPayoff(debtRows, extra, dtStrategy);
  const minOnlyResult = Calc.debtPayoff(debtRows, 0, dtStrategy);

  const fmtMonths = m => m === Infinity ? '∞' : m < 12 ? m + ' mo' : Math.floor(m / 12) + 'y ' + (m % 12) + 'mo';

  $('dt-total-bal').textContent = fmt(debtRows.reduce((s, d) => s + d.balance, 0));
  $('dt-months-min').textContent = fmtMonths(minOnlyResult.months);
  $('dt-months-extra').textContent = fmtMonths(stratResult.months);
  $('dt-int-min').textContent = minOnlyResult.totalInt === Infinity ? '∞' : fmt(minOnlyResult.totalInt);
  $('dt-int-saved').textContent = (minOnlyResult.totalInt === Infinity || stratResult.totalInt === Infinity)
    ? '—'
    : fmt(Math.max(0, minOnlyResult.totalInt - stratResult.totalInt));

  // Build chart from balance histories
  const maxLen = Math.max(stratResult.balanceHistory.length, minOnlyResult.balanceHistory.length);
  const labels = [];
  for (let i = 0; i < maxLen; i++) {
    labels.push(i === 0 ? 'Now' : i < 12 ? i + 'mo' : 'Yr ' + (i / 12).toFixed(1));
  }
  // Sample down for chart
  const step = Math.max(1, Math.floor(maxLen / 60));
  const sample = arr => {
    const out = [];
    for (let i = 0; i < arr.length; i += step) out.push(arr[i]);
    if (arr.length && (arr.length - 1) % step !== 0) out.push(arr[arr.length - 1]);
    return out;
  };
  const sampledLabels = sample(labels);
  const sampledMin = sample(minOnlyResult.balanceHistory);
  const sampledExt = sample(stratResult.balanceHistory);

  renderChart('dt-chart', 'line', {
    labels: sampledLabels,
    datasets: [
      { label: 'Min only', data: sampledMin, borderColor: '#88887f', backgroundColor: 'rgba(136,136,127,0.1)', fill: true, pointRadius: 0, tension: 0.3 },
      { label: 'With strategy', data: sampledExt, borderColor: '#c9a227', backgroundColor: 'rgba(201,162,39,0.12)', fill: true, pointRadius: 0, tension: 0.3 },
    ],
  }, {
    responsive: true, maintainAspectRatio: false,
    plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => ' ' + fmt(c.raw) } } },
    scales: {
      x: { ticks: { ...tickStyle, autoSkip: true, maxTicksLimit: 10 }, grid: { display: false } },
      y: { ticks: { ...tickStyle, callback: fmtk }, grid: { color: gridColor }, min: 0 },
    },
  });
}

// ════════════════════════════════════════════════
// HOME AFFORDABILITY
// ════════════════════════════════════════════════
function affUpdate() {
  if (!$('aff-income')) return;
  const opts = {
    grossMonthlyIncome: val('aff-income'),
    monthlyDebts: val('aff-debts'),
    downCash: val('aff-down'),
    mortgageRate: val('aff-rate'),
  };

  $('aff-income-out').textContent = fmt(opts.grossMonthlyIncome) + '/mo';
  $('aff-debts-out').textContent = fmt(opts.monthlyDebts) + '/mo';
  $('aff-down-out').textContent = fmt(opts.downCash);
  $('aff-rate-out').textContent = fmtRate(opts.mortgageRate);

  const r = Calc.affordability(opts);

  $('aff-max-price').textContent = r.maxPrice <= 0 ? '$0' : fmt(r.maxPrice);
  $('aff-max-piti').textContent = fmt(r.piti);
  $('aff-down-pct').textContent = r.downPct.toFixed(1) + '%';
  $('aff-loan').textContent = fmt(r.loan);

  // Verdict
  let verdict = '';
  if (r.maxPrice <= 0) {
    verdict = 'Your existing monthly debts exceed the back-end DTI limit (36% of income). Paying down debt first will unlock affordability.';
  } else if (r.downPct < 20) {
    verdict = `At this price, your <strong>${r.downPct.toFixed(1)}%</strong> down payment is below 20%, so monthly PMI is included. Reaching 20% down would let you afford a higher price.`;
  } else {
    verdict = `Based on the standard <strong>28/36 DTI rule</strong>, you can afford a home up to <strong>${fmt(r.maxPrice)}</strong> with a <strong>${fmt(r.piti)}/mo</strong> all-in payment (PITI).`;
  }
  $('aff-verdict').innerHTML = verdict;

  // Chart: max PITI breakdown
  if (r.maxPrice > 0) {
    const pmt = Calc.pmt(r.loan, opts.mortgageRate, 30);
    const tax = r.maxPrice * 0.012 / 12;
    const ins = r.maxPrice * 0.005 / 12;
    const pmi = Math.max(0, r.piti - pmt - tax - ins);
    renderChart('aff-chart', 'doughnut', {
      labels: ['Principal & Interest', 'Property Tax', 'Insurance', 'PMI'],
      datasets: [{
        data: [Math.round(pmt), Math.round(tax), Math.round(ins), Math.round(pmi)],
        backgroundColor: ['#c9a227', '#7ab0c8', '#b89030', '#88887f'],
        borderColor: '#1a1a1a',
        borderWidth: 2,
      }],
    }, {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { display: true, position: 'right', labels: { color: '#f0ece3', font: { size: 11, family: 'DM Sans' } } },
        tooltip: { callbacks: { label: c => ' ' + c.label + ': ' + fmt(c.raw) } },
      },
    });
  }
}

// ════════════════════════════════════════════════
// URL SHARING / RESET / SHARE FALLBACK
// ════════════════════════════════════════════════
const allSliders = [
  'ci-principal', 'ci-rate', 'ci-years', 'ci-monthly',
  'mg-price', 'mg-down', 'mg-rate', 'mg-term', 'mg-tax', 'mg-ins',
  'rvb-price', 'rvb-rent', 'rvb-rate', 'rvb-down', 'rvb-appr', 'rvb-rinc', 'rvb-inv', 'rvb-years',
  'ret-age', 'ret-retage', 'ret-saved', 'ret-contrib', 'ret-rate', 'ret-spend', 'ret-infl',
  'dt-extra',
  'aff-income', 'aff-debts', 'aff-down', 'aff-rate',
];

function updateURL() {
  const params = new URLSearchParams();
  params.set('p', activePanel);
  // Use val() so typed values (including off-step decimals) survive in the URL
  allSliders.forEach(id => { if ($(id)) params.set(id, String(val(id))); });
  // also serialize debt rows
  params.set('debts', encodeURIComponent(JSON.stringify(debtRows)));
  params.set('dts', dtStrategy);
  history.replaceState(null, '', '?' + params.toString());
}

function loadFromURL() {
  const params = new URLSearchParams(window.location.search);
  if (params.has('p')) { activePanel = params.get('p'); showPanel(activePanel); }
  allSliders.forEach(id => {
    if (params.has(id)) {
      const el = $(id); const numEl = $(id + '-num');
      if (el) el.value = params.get(id);
      if (numEl) numEl.value = params.get(id);
    }
  });
  if (params.has('debts')) {
    try { debtRows = JSON.parse(decodeURIComponent(params.get('debts'))); renderDebtRows(); } catch (e) {}
  }
  if (params.has('dts')) {
    dtStrategy = params.get('dts');
    if ($('dt-strat-' + dtStrategy)) {
      document.querySelectorAll('[id^="dt-strat-"]').forEach(b => b.classList.remove('active'));
      $('dt-strat-' + dtStrategy).classList.add('active');
    }
  }
}

function shareLink() {
  updateURL();
  const url = window.location.href;
  const ok = () => {
    const btn = $('share-btn');
    if (!btn) return;
    const orig = btn.innerHTML;
    btn.innerHTML = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg> Copied!';
    btn.classList.add('success');
    setTimeout(() => { btn.innerHTML = orig; btn.classList.remove('success'); }, 2000);
    track('share', { panel: activePanel });
  };

  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(url).then(ok).catch(legacyCopy);
  } else {
    legacyCopy();
  }

  function legacyCopy() {
    try {
      const ta = document.createElement('textarea');
      ta.value = url; ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.focus(); ta.select();
      const success = document.execCommand('copy');
      document.body.removeChild(ta);
      if (success) ok();
      else window.prompt('Copy this link:', url);
    } catch (e) {
      window.prompt('Copy this link:', url);
    }
  }
}

// Default values, used by reset
const DEFAULTS = {
  'ci-principal': 10000, 'ci-rate': 7, 'ci-years': 20, 'ci-monthly': 200,
  'mg-price': 400000, 'mg-down': 20, 'mg-rate': 6.5, 'mg-term': 30, 'mg-tax': 1.2, 'mg-ins': 0.5,
  'rvb-price': 400000, 'rvb-rent': 2000, 'rvb-rate': 6.5, 'rvb-down': 20,
  'rvb-appr': 3, 'rvb-rinc': 3, 'rvb-inv': 7, 'rvb-years': 10,
  'ret-age': 30, 'ret-retage': 65, 'ret-saved': 25000, 'ret-contrib': 500,
  'ret-rate': 7, 'ret-spend': 4000, 'ret-infl': 2.5,
  'dt-extra': 100,
  'aff-income': 8000, 'aff-debts': 500, 'aff-down': 50000, 'aff-rate': 6.5,
};

function resetActivePanel() {
  const prefix = { mortgage: 'mg-', rentvbuy: 'rvb-', compound: 'ci-', retirement: 'ret-', debt: 'dt-', affordability: 'aff-' }[activePanel];
  if (!prefix) return;
  Object.entries(DEFAULTS).forEach(([id, v]) => {
    if (!id.startsWith(prefix)) return;
    const el = $(id), num = $(id + '-num');
    if (el) el.value = v;
    if (num) num.value = v;
  });
  if (activePanel === 'debt') {
    debtRows = [
      { name: 'Credit card', balance: 6000, rate: 22, minPay: 150 },
      { name: 'Car loan', balance: 14000, rate: 7, minPay: 300 },
    ];
    renderDebtRows();
  }
  // Trigger updates
  ({ mortgage: mgUpdate, rentvbuy: rvbUpdate, compound: ciUpdate, retirement: retUpdate, debt: dtUpdate, affordability: affUpdate }[activePanel])();
  updateURL();
  track('reset', { panel: activePanel });
}

function printPage() { window.print(); track('print', { panel: activePanel }); }

// ════════════════════════════════════════════════
// INIT (no-ops if elements aren't present)
// ════════════════════════════════════════════════
function init() {
  if (typeof document === 'undefined') return;
  if (!$('tab-mortgage')) return; // not on the calculator page

  // Bind all slider/number input pairs
  allSliders.forEach(bindRangeNum);

  // Tab keyboard nav
  setupTabKeyboardNav();

  // Wire input listeners
  ['ci-principal', 'ci-rate', 'ci-years', 'ci-monthly'].forEach(id => $(id) && $(id).addEventListener('input', ciUpdate));
  ['mg-price', 'mg-down', 'mg-rate', 'mg-term', 'mg-tax', 'mg-ins'].forEach(id => $(id) && $(id).addEventListener('input', mgUpdate));
  ['rvb-price', 'rvb-rent', 'rvb-rate', 'rvb-down', 'rvb-appr', 'rvb-rinc', 'rvb-inv', 'rvb-years'].forEach(id => $(id) && $(id).addEventListener('input', rvbUpdate));
  ['ret-age', 'ret-retage', 'ret-saved', 'ret-contrib', 'ret-rate', 'ret-spend', 'ret-infl'].forEach(id => $(id) && $(id).addEventListener('input', retUpdate));
  ['dt-extra'].forEach(id => $(id) && $(id).addEventListener('input', dtUpdate));
  ['aff-income', 'aff-debts', 'aff-down', 'aff-rate'].forEach(id => $(id) && $(id).addEventListener('input', affUpdate));

  // Tab click handlers
  PANELS.forEach(name => {
    const tab = $('tab-' + name);
    if (tab) tab.addEventListener('click', () => showPanel(name));
  });

  // Mortgage inner tabs
  if ($('mg-tab-amort')) $('mg-tab-amort').addEventListener('click', () => mgTab('amort'));
  if ($('mg-tab-split')) $('mg-tab-split').addEventListener('click', () => mgTab('split'));

  // Debt strategy toggle
  ['snowball', 'avalanche'].forEach(s => {
    const b = $('dt-strat-' + s);
    if (b) b.addEventListener('click', () => {
      dtStrategy = s;
      document.querySelectorAll('[id^="dt-strat-"]').forEach(btn => btn.classList.remove('active'));
      b.classList.add('active');
      dtUpdate();
    });
  });

  // Add-debt button
  if ($('dt-add-debt')) {
    $('dt-add-debt').addEventListener('click', () => {
      debtRows.push({ name: 'New debt', balance: 1000, rate: 10, minPay: 50 });
      renderDebtRows();
      dtUpdate();
    });
  }

  // Action buttons
  if ($('share-btn')) $('share-btn').addEventListener('click', shareLink);
  if ($('print-btn')) $('print-btn').addEventListener('click', printPage);
  if ($('reset-btn')) $('reset-btn').addEventListener('click', resetActivePanel);

  // Info-button tap support (for touch devices)
  document.querySelectorAll('.info-btn').forEach(b => {
    b.setAttribute('tabindex', '0');
    b.setAttribute('role', 'button');
    b.addEventListener('click', e => {
      e.preventDefault();
      document.querySelectorAll('.info-btn.open').forEach(o => o !== b && o.classList.remove('open'));
      b.classList.toggle('open');
    });
  });
  document.addEventListener('click', e => {
    if (!e.target.classList || !e.target.classList.contains('info-btn')) {
      document.querySelectorAll('.info-btn.open').forEach(o => o.classList.remove('open'));
    }
  });

  // URL update on input
  allSliders.forEach(id => { const el = $(id); if (el) el.addEventListener('input', updateURL); });

  // Render initial state
  renderDebtRows();
  ciUpdate(); mgUpdate(); rvbUpdate(); retUpdate(); dtUpdate(); affUpdate();

  // Load from URL last (overrides defaults)
  loadFromURL();
  // Re-run updates after URL load
  ciUpdate(); mgUpdate(); rvbUpdate(); retUpdate(); dtUpdate(); affUpdate();
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
}
