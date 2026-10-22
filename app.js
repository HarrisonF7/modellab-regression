
import * as m10 from "./m10.js";

const LABELS = {
  glucose: "Fasting glucose",
  sbp: "Blood pressure",
  fev1: "Lung function (FEV₁)"
};

const state = {
  key: "glucose",
  person: "P1",
  values: null,
  nTrees: 10,
  round: 1
};

const $ = id => document.getElementById(id);

const fmt = (v, d = 1) =>
  Number(v).toLocaleString("en-US", {
    minimumFractionDigits: d,
    maximumFractionDigits: d
  });

const signed = (v, d = 1) =>
  (v >= 0 ? "+" : "−") + fmt(Math.abs(v), d);

const featureLabel = (b, name) =>
  (b.features.find(f => f.name === name) || { label: name }).label;

function section() {
  const s = location.hash.slice(1);
  return ["linear", "forest", "boosting"].includes(s) ? s : "linear";
}

async function setup() {
  $("dataset").innerHTML = m10.DATASETS.map(
    k => `<option value="${k}">${LABELS[k]}</option>`
  ).join("");

  $("dataset").onchange = async e => {
    state.key = e.target.value;
    state.person = "P1";
    state.nTrees = 10;
    state.round = 1;
    await loadPeople();
    render();
  };

  $("person").onchange = e => {
    state.person = e.target.value;
    state.values = null;
    render();
  };

  window.onhashchange = render;

  await loadPeople();
  render();
}

async function loadPeople() {
  const b = await m10.loadBundle(state.key);

  $("person").innerHTML = b.people.map(
    p => `<option value="${p.id}">${p.label}: ${p.description}</option>`
  ).join("");

  $("person").value = state.person;
  state.values = null;
}

async function render() {
  document.querySelectorAll("nav a").forEach(a =>
    a.classList.toggle("active", a.hash === "#" + section())
  );

  const b = await m10.loadBundle(state.key);
  const person = b.people.find(p => p.id === state.person);

  if (!state.values) {
    state.values = { ...person.values };
  }

  const draw = {
    linear: renderLinear,
    forest: renderForest,
    boosting: renderBoosting
  }[section()];

  draw(b, person);
}

// ==================================================
// SECTION 1: PUSH & PULL
// ==================================================

function renderLinear(b, person) {
  const u = b.units;
  const ex = m10.linearExplain(b, state.values);
  const groups = b.categorical_groups || [];

  const grouped = new Set(
    groups.flatMap(g =>
      g.levels.filter(lv => lv.column).map(lv => lv.column)
    )
  );

  const numeric = b.features.filter(f => !grouped.has(f.name));
  const pushes = Object.entries(ex.groupedPushes);

  const maxPush = Math.max(
    1,
    ...pushes.map(([, v]) => Math.abs(v))
  );

  const totalPush = pushes.reduce((sum, [, v]) => sum + v, 0);

  const label = name => {
    const g = groups.find(group => group.name === name);

    return g
      ? `${g.label}: ${m10.categoryOf(b, name, state.values)}`
      : featureLabel(b, name);
  };

  const largestUpward = pushes
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1])[0];

  const bars = pushes.map(([name, value]) => {
    const positive = value >= 0;
    const width = Math.abs(value) / maxPush * 100;

    return `
      <div class="push-row">
        <div class="push-heading">
          <strong>${label(name)}</strong>
          <strong class="${positive ? "up" : "down"}">
            ${signed(value, 2)} ${u}
          </strong>
        </div>

        <div class="push-track">
          <div class="push-half left">
            ${!positive
              ? `<div class="push-fill negative"
                   style="width:${width}%"></div>`
              : ""}
          </div>

          <div class="push-half right">
            ${positive
              ? `<div class="push-fill positive"
                   style="width:${width}%"></div>`
              : ""}
          </div>
        </div>
      </div>
    `;
  }).join("");

  const first = numeric[0];

  // Use the training feature means from the data bundle.
  const coefficient = first
    ? b.linear.coefficients?.[first.name] ??
      b.linear.coef?.[first.name]
    : null;

  const reference = first
    ? b.linear.reference?.[first.name] ??
      b.linear.means?.[first.name] ??
      b.feature_stats[first.name]?.mean
    : null;

  const coefficientText =
    Number.isFinite(Number(coefficient))
      ? signed(coefficient, 3)
      : "Not available";

  const referenceText =
    Number.isFinite(Number(reference))
      ? fmt(reference)
      : "Not available";

  $("section").innerHTML = `
    <div class="lesson-intro">
      <span class="lesson-tag">01 / LINEAR REGRESSION</span>

      <h2>Push &amp; Pull</h2>

      <p>
        Start with an average prediction. See exactly how
        each feature pushes it up or down.
      </p>
    </div>

    <div class="lesson-card">
      <h3>1. Change the inputs</h3>

      <p>
        These values describe ${person.label}.
        Edit them to see how the fixed model responds.
      </p>

      <div class="inputs">
        ${numeric.map(f => {
          const s = b.feature_stats[f.name];

          return `
            <label>
              ${f.label} (${f.units})

              <input
                type="number"
                data-f="${f.name}"
                value="${state.values[f.name]}"
                min="${s.min}"
                max="${s.max}"
                step="any"
              >
            </label>
          `;
        }).join("")}

        ${groups.map(g => `
          <label>
            ${g.label}

            <select data-g="${g.name}">
              ${g.levels.map(lv => `
                <option
                  ${lv.label === m10.categoryOf(
                    b, g.name, state.values
                  ) ? "selected" : ""}
                >
                  ${lv.label}
                </option>
              `).join("")}
            </select>
          </label>
        `).join("")}
      </div>

      <button
        class="lesson-button"
        id="reset-person"
        type="button"
      >
        Reset to selected person
      </button>
    </div>

    <div class="lesson-card">
      <h3>2. Watch the prediction add up</h3>

      <div class="prediction-summary">
        <div class="summary-box">
          <small>STARTING POINT</small>
          <strong>${fmt(ex.baseline)}</strong>
          <span>${u}</span>
        </div>

        <div class="summary-symbol">+</div>

        <div class="summary-box">
          <small>ALL PUSHES</small>

          <strong class="${totalPush >= 0 ? "up" : "down"}">
            ${signed(totalPush)}
          </strong>

          <span>${u}</span>
        </div>

        <div class="summary-symbol">=</div>

        <div class="summary-box final">
          <small>PREDICTION</small>
          <strong>${fmt(ex.prediction)}</strong>
          <span>${u}</span>
        </div>
      </div>

      <h3>Each feature's push</h3>

      <p>
        Orange = higher prediction.
        Teal = lower prediction.
        Longer bars mean larger contributions
        <em>for this person</em>.
      </p>

      <div class="push-chart">
        ${bars}
      </div>
    </div>

    <div class="lesson-card">
      <h3>3. The prediction receipt</h3>

      <table>
        <tr>
          <td>Starting point (training average)</td>
          <td class="num">${fmt(ex.baseline)} ${u}</td>
        </tr>

        ${pushes.map(([name, value]) => `
          <tr>
            <td>${label(name)}</td>

            <td class="num ${value >= 0 ? "up" : "down"}">
              ${signed(value, 2)} ${u}
            </td>
          </tr>
        `).join("")}

        <tr>
          <th>Final prediction</th>
          <th class="num">${fmt(ex.prediction)} ${u}</th>
        </tr>
      </table>

      <p class="formula">
        Starting point + every signed push = prediction
      </p>

      <p class="note">
        Values in the receipt are rounded for display.
        The model uses full precision.
      </p>
    </div>

    <div class="lesson-card">
      <h3>4. Coefficient vs. personal push</h3>

      <p>
        A <strong>coefficient</strong> describes how much
        the model's prediction changes for a one-unit
        increase in a feature, holding other features fixed.
      </p>

      <p>
        A <strong>personal push</strong> depends on how far
        this person's value is from the training average.
      </p>

      ${first ? `
        <div class="example-explanation">
          <strong>Example: ${first.label}</strong>

          <p>
            Coefficient:
            ${coefficientText}
            ${u} per ${first.units}.
          </p>

          <p>
            Training average:
            ${referenceText} ${first.units}.
          </p>

          <p>
            This person's value:
            ${fmt(state.values[first.name])} ${first.units}.
          </p>

          <p>
            Personal push =
            coefficient × (person's value − training average)
          </p>

          <p>
            <strong>
              ${signed(ex.groupedPushes[first.name], 2)} ${u}
            </strong>
          </p>
        </div>
      ` : ""}

      <p class="note">
        One person's largest push is not automatically
        the most important feature across the dataset.
        Different features vary on different scales.
      </p>

      ${groups.map(g => `
        <p class="note">
          <strong>${g.label}:</strong>
          Coding reference group: ${g.reference}.
          Personal pushes are measured relative to the
          average training mix, not the coding reference
          group. Even a reference-group participant can
          have a nonzero push.
        </p>
      `).join("")}

      <p class="note">
        These are associations learned from survey data,
        not causal effects. The starting point is the
        prediction for the training average, not the intercept.
      </p>
    </div>

    <div class="lesson-card takeaway">
      <h3>Check your understanding</h3>

      <p>
        Which feature pushes this person's prediction
        upward the most?
      </p>

      <button
        class="lesson-button"
        id="reveal-answer"
        type="button"
      >
        Reveal answer
      </button>

      <p id="answer-box" hidden>
        ${largestUpward
          ? `${label(largestUpward[0])}:
             ${signed(largestUpward[1], 2)} ${u}.`
          : "No feature pushes the prediction upward for this person."}

        The final prediction includes all positive
        and negative pushes.
      </p>
    </div>
  `;

  document.querySelectorAll("[data-f]").forEach(el => {
    el.onchange = () => {
      if (el.value.trim() === "") return;

      const value = Number(el.value);
      const s = b.feature_stats[el.dataset.f];

      if (!Number.isFinite(value)) return;

      state.values[el.dataset.f] = Math.max(
        s.min,
        Math.min(s.max, value)
      );

      renderLinear(b, person);
    };
  });

  document.querySelectorAll("[data-g]").forEach(el => {
    el.onchange = () => {
      Object.assign(
        state.values,
        m10.categoryInputs(b, el.dataset.g, el.value)
      );

      renderLinear(b, person);
    };
  });

  $("reset-person").onclick = () => {
    state.values = { ...person.values };
    renderLinear(b, person);
  };

  $("reveal-answer").onclick = () => {
    const answer = $("answer-box");
    answer.hidden = !answer.hidden;

    $("reveal-answer").textContent = answer.hidden
      ? "Reveal answer"
      : "Hide answer";
  };
}

// ==================================================
// SECTION 2: WISDOM OF THE FOREST
// ==================================================

function renderForest(b, person) {
  const u = b.units;
  const rf = b.forest;
  const trees = rf.people[person.id].tree_predictions;
  const total = trees.length;
  const n = Math.max(1, Math.min(total, Number(state.nTrees || 10)));

  const fullPrediction = rf.people[person.id].prediction;
  const low = Math.min(...trees);
  const high = Math.max(...trees);

  const padding = Math.max((high - low) * 0.12, 1);
  const scaleMin = low - padding;
  const scaleMax = high + padding;

  const position = value =>
    ((value - scaleMin) / (scaleMax - scaleMin)) * 100;

  $("section").innerHTML = `
    <div class="lesson-intro">
      <span class="lesson-tag">02 / RANDOM FOREST</span>

      <h2>Wisdom of the Forest</h2>

      <p>
        One tree makes one prediction. A random forest
        combines many different trees by averaging
        their predictions.
      </p>
    </div>

    <div class="lesson-card">
      <h3>1. Meet the forest</h3>

      <p>
        ${person.label} (${person.description}).
        The observed value is
        <strong>${fmt(person.observed)} ${u}</strong>.
      </p>

      <div class="prediction-summary">
        <div class="summary-box">
          <small>TREE 1 PREDICTS</small>
          <strong>${fmt(trees[0])}</strong>
          <span>${u}</span>
        </div>

        <div class="summary-symbol">→</div>

        <div class="summary-box final">
          <small>ALL ${total} TREES PREDICT</small>
          <strong>${fmt(fullPrediction)}</strong>
          <span>${u}</span>
        </div>
      </div>

      <p class="note">
        A single tree can give a very different answer
        from the complete forest. The forest's prediction
        is the average of all ${total} tree predictions.
      </p>
    </div>

    <div class="lesson-card">
      <h3>2. Build your own forest</h3>

      <p>
        Drag the slider to add trees one at a time.
        Watch how their running average changes.
      </p>

      <label style="display:block;font-weight:700;margin:20px 0">
        Trees included:
        <strong id="ntrees-value">${n}</strong>
      </label>

      <input
        id="ntrees"
        type="range"
        min="1"
        max="${total}"
        value="${n}"
        style="width:100%;max-width:none"
      >

      <div class="prediction-summary">
        <div class="summary-box">
          <small>YOUR FOREST'S AVERAGE</small>
          <strong id="partial-average"></strong>
          <span>${u}</span>
        </div>

        <div class="summary-box final">
          <small>COMPLETE FOREST</small>
          <strong>${fmt(fullPrediction)}</strong>
          <span>${u}</span>
        </div>
      </div>

      <p id="forest-status" class="formula"></p>

      <h3>How the average changes</h3>

      <p>
        The teal line shows the running average as
        trees are added. The purple dashed line
        marks the complete forest's prediction.
      </p>

      <div id="forest-running-chart"></div>
    </div>

    <div class="lesson-card">
      <h3>3. See how the trees disagree</h3>

      <p>
        Each dot below represents one tree's prediction.
        Teal dots are included in your partial forest.
        Gray dots are trees you haven't added yet.
      </p>

      <div
        id="tree-votes"
        style="
          position:relative;
          height:155px;
          background:#f5f7ff;
          border-radius:14px;
          margin:24px 0;
          overflow:hidden;
        "
      ></div>

      <div style="
        display:flex;
        justify-content:space-between;
        color:var(--muted);
        font-size:14px;
      ">
        <span>${fmt(low)} ${u}</span>
        <span>${fmt(high)} ${u}</span>
      </div>

      <p class="note">
        The individual predictions range from
        <strong>${fmt(low)} to ${fmt(high)} ${u}</strong>.
        This is disagreement between trees,
        <strong>not a confidence interval</strong>
        or a calibrated uncertainty estimate.
      </p>
    </div>

    <div class="lesson-card">
      <h3>4. Why do the trees differ?</h3>

      <div class="example-explanation">
        <strong>Different training samples</strong>

        <p>
          Each tree learns from a bootstrap sample.
          Training people are sampled with replacement,
          so some appear more than once and others
          are left out.
        </p>
      </div>

      <div class="example-explanation">
        <strong>Different features at each split</strong>

        <p>
          Each tree considers only
          <strong>${rf.features_tried_per_split}
          of ${rf.n_features}</strong>
          features at each split.
          This encourages different tree structures.
        </p>
      </div>

      <div class="example-explanation">
        <strong>Why averaging helps</strong>

        <p>
          Some trees predict higher, while others
          predict lower. Averaging can make those
          differences partly cancel, producing
          a steadier prediction.
        </p>

        <p>
          Averaging does not guarantee accuracy,
          especially if many trees make similar mistakes.
        </p>
      </div>
    </div>

    <div class="lesson-card takeaway">
      <h3>Check your understanding</h3>

      <p>
        Why might averaging many different tree
        predictions be steadier than trusting one tree?
      </p>

      <button
        id="forest-reveal"
        class="lesson-button"
        type="button"
      >
        Reveal answer
      </button>

      <p id="forest-answer" hidden>
        The trees make different predictions.
        Averaging can partly cancel their individual
        errors, so one unusually high or low tree
        has less influence on the final result.
      </p>
    </div>
  `;

  const averages = [];
  let sum = 0;

  for (let i = 0; i < total; i++) {
    sum += trees[i];
    averages.push(sum / (i + 1));
  }

  function update(k) {
    const currentAverage = averages[k - 1];

    $("ntrees-value").textContent = k;
    $("partial-average").textContent = fmt(currentAverage);

    $("forest-status").textContent = k === total
      ? `Complete forest: all ${total} trees included.`
      : `Partial forest: averaging the first ${k} of ${total} trees.`;

    const W = 800;
    const H = 245;
    const pad = 40;

    const allMin = Math.min(...averages, fullPrediction);
    const allMax = Math.max(...averages, fullPrediction);
    const gap = Math.max((allMax - allMin) * 0.15, 1);

    const yMin = allMin - gap;
    const yMax = allMax + gap;

    const x = i =>
      pad + i / Math.max(1, total - 1) * (W - 2 * pad);

    const y = v =>
      H - pad - (v - yMin) / (yMax - yMin) * (H - 2 * pad);

    const line = averages.slice(0, k).map((v, i) =>
      `${i === 0 ? "M" : "L"}${x(i)},${y(v)}`
    ).join(" ");

    $("forest-running-chart").innerHTML = `
      <svg
        viewBox="0 0 ${W} ${H}"
        role="img"
        aria-label="Running average of tree predictions"
      >
        <line
          x1="${pad}"
          x2="${W - pad}"
          y1="${y(fullPrediction)}"
          y2="${y(fullPrediction)}"
          stroke="var(--accent)"
          stroke-width="2"
          stroke-dasharray="6 5"
        />

        <path
          d="${line}"
          fill="none"
          stroke="var(--down)"
          stroke-width="3"
          stroke-linecap="round"
          stroke-linejoin="round"
        />

        <circle
          cx="${x(k - 1)}"
          cy="${y(currentAverage)}"
          r="6"
          fill="var(--down)"
          stroke="white"
          stroke-width="2"
        />

        <text
          x="${pad}"
          y="${H - 10}"
          fill="var(--muted)"
          font-size="14"
        >
          Trees: 1 to ${total}
        </text>

        <text
          x="${pad}"
          y="23"
          fill="var(--accent)"
          font-size="14"
        >
          Purple dashed line = complete forest average
        </text>
      </svg>
    `;

    $("tree-votes").innerHTML = `
      <div style="
        position:absolute;
        left:${position(fullPrediction)}%;
        top:0;
        bottom:0;
        width:3px;
        background:var(--accent);
        z-index:2;
      "></div>

      ${trees.map((value, i) => {
        const included = i < k;
        const left = position(value);
        const top = 18 + (i % 6) * 19;

        return `
          <div
            title="Tree ${i + 1}: ${fmt(value)} ${u}"
            style="
              position:absolute;
              left:calc(${left}% - 5px);
              top:${top}px;
              width:10px;
              height:10px;
              border-radius:50%;
              background:${included ? "var(--down)" : "#cbd2e4"};
              opacity:${included ? 0.9 : 0.5};
              transition:background .2s, opacity .2s;
            "
          ></div>
        `;
      }).join("")}
    `;
  }

  $("ntrees").oninput = e => {
    state.nTrees = Number(e.target.value);
    update(state.nTrees);
  };

  $("forest-reveal").onclick = () => {
    const answer = $("forest-answer");
    answer.hidden = !answer.hidden;

    $("forest-reveal").textContent = answer.hidden
      ? "Reveal answer"
      : "Hide answer";
  };

  update(n);
}

// ==================================================
// SECTION 3: ONE CORRECTION AT A TIME
// ==================================================

function renderBoosting(b, person) {
  const u = b.units;
  const gb = b.boosting;
  const p = gb.people[person.id];
  const maxRound = p.corrections.length;

  const r = Math.max(
    0,
    Math.min(maxRound, Number(state.round ?? 1))
  );

  const best = gb.best_validation_round;

  $("section").innerHTML = `
    <div class="lesson-intro">
      <span class="lesson-tag">03 / GRADIENT BOOSTING</span>

      <h2>One Correction at a Time</h2>

      <p>
        Start with one simple prediction.
        Add trees that correct the errors left behind.
        Discover why more trees are not always better.
      </p>
    </div>

    <div class="lesson-card">
      <h3>1. Start with a guess</h3>

      <p>
        ${person.label} (${person.description}).
        The observed value is
        <strong>${fmt(person.observed)} ${u}</strong>.
      </p>

      <div class="prediction-summary">
        <div class="summary-box">
          <small>ROUND 0: STARTING GUESS</small>
          <strong>${fmt(gb.init)}</strong>
          <span>${u}</span>
        </div>

        <div class="summary-symbol">→</div>

        <div class="summary-box final">
          <small>AFTER ${maxRound} CORRECTIONS</small>
          <strong>${fmt(p.staged[maxRound])}</strong>
          <span>${u}</span>
        </div>
      </div>

      <p class="note">
        Round 0 is the average outcome in the training data.
        Every new tree learns to correct remaining prediction
        errors from the previous rounds.
      </p>
    </div>

    <div class="lesson-card">
      <h3>2. Build the prediction one correction at a time</h3>

      <p>
        Move the slider to choose how many correction trees
        to include. Watch the prediction update.
      </p>

      <label style="display:block;font-weight:700;margin:20px 0">
        Boosting round:
        <strong id="round-value">${r}</strong>
        of ${maxRound}
      </label>

      <input
        id="round"
        type="range"
        min="0"
        max="${maxRound}"
        value="${r}"
        style="width:100%;max-width:none"
      >

      <div style="
        display:flex;
        flex-wrap:wrap;
        gap:12px;
        margin:20px 0 28px;
      ">
        <button
          id="boost-start"
          class="lesson-button"
          type="button"
        >
          Start over
        </button>

        <button
          id="boost-next"
          class="lesson-button"
          type="button"
        >
          Next correction →
        </button>

        <button
          id="boost-best"
          class="lesson-button"
          type="button"
        >
          Jump to best validation round
        </button>
      </div>

      <div id="boosting-calculation"></div>

      <h3>How this person's prediction changes</h3>

      <p>
        The teal line tracks the prediction after each round.
        The purple marker shows the round you selected.
      </p>

      <div id="boost-prediction-chart"></div>
    </div>

    <div class="lesson-card">
      <h3>3. When should the model stop?</h3>

      <p>
        A model can keep improving on its training data
        while getting worse on new data.
        Compare the training and validation errors below.
      </p>

      <div class="prediction-summary">
        <div class="summary-box">
          <small>YOUR STOPPING ROUND</small>
          <strong id="chosen-round">${r}</strong>
          <span>trees added</span>
        </div>

        <div class="summary-symbol">vs.</div>

        <div class="summary-box final">
          <small>BEST VALIDATION ROUND</small>
          <strong>${best}</strong>
          <span>${fmt(gb.best_validation_rmse)} ${u} RMSE</span>
        </div>
      </div>

      <div id="boost-rmse-chart"></div>

      <div id="boost-rmse-explanation"></div>
    </div>

    <div class="lesson-card">
      <h3>4. Why corrections help — and when they hurt</h3>

      <div class="example-explanation">
        <strong>Each tree learns from remaining errors</strong>

        <p>
          Gradient boosting adds trees sequentially.
          Each new tree is trained to predict the residuals
          left by the model built so far.
        </p>
      </div>

      <div class="example-explanation">
        <strong>The learning rate controls each step</strong>

        <p>
          Each tree's correction is scaled by the
          learning rate before being added.
          The correction displayed above already includes
          that scaling, so it must not be multiplied again.
        </p>
      </div>

      <div class="example-explanation">
        <strong>Training error is not the whole story</strong>

        <p>
          Adding more trees can continue reducing
          training error while validation error
          begins rising. This can indicate overfitting.
        </p>
      </div>

      <p class="note">
        Validation data help choose the stopping round.
        Because the stopping point was selected using
        validation results, the lowest validation RMSE
        is not an independent test result.
      </p>
    </div>

    <div class="lesson-card takeaway">
      <h3>Check your understanding</h3>

      <p>
        Why shouldn't we automatically choose the
        round with the lowest training RMSE?
      </p>

      <button
        id="boost-reveal"
        class="lesson-button"
        type="button"
      >
        Reveal answer
      </button>

      <p id="boost-answer" hidden>
        Training RMSE measures performance on data the
        model learned from. It can keep decreasing even
        after the model starts overfitting.
        Validation RMSE gives a better guide for choosing
        when to stop, although final performance should
        still be evaluated on independent test data.
      </p>
    </div>
  `;

  function update(k) {
    state.round = k;
    $("round").value = k;
    $("round-value").textContent = k;
    $("chosen-round").textContent = k;

    const previous = k === 0 ? gb.init : p.staged[k - 1];
    const correction = k === 0 ? 0 : p.corrections[k - 1];
    const current = p.staged[k];

    $("boosting-calculation").innerHTML = `
      <div class="prediction-summary">
        <div class="summary-box">
          <small>PREVIOUS PREDICTION</small>
          <strong>${fmt(previous)}</strong>
          <span>${u}</span>
        </div>

        <div class="summary-symbol">+</div>

        <div class="summary-box">
          <small>TREE ${k} CORRECTION</small>
          <strong class="${correction >= 0 ? "up" : "down"}">
            ${signed(correction, 2)}
          </strong>
          <span>${u}</span>
        </div>

        <div class="summary-symbol">=</div>

        <div class="summary-box final">
          <small>NEW PREDICTION</small>
          <strong>${fmt(current)}</strong>
          <span>${u}</span>
        </div>
      </div>

      <p class="formula">
        ${k === 0
          ? "Round 0: start with the training average."
          : `Round ${k}: previous prediction + scaled correction = updated prediction.`}
      </p>

      <p class="note">
        ${k === 0
          ? "No correction trees have been added yet."
          : `Tree ${k} contributes ${signed(correction, 2)} ${u}.
             This correction already includes the learning rate.`}
      </p>
    `;

    $("boost-prediction-chart").innerHTML =
      predictionChart(p.staged, k, u);

    $("boost-rmse-chart").innerHTML =
      rmseChart(gb, k, u);

    const validation = gb.rmse.validation[k];
    const training = gb.rmse.train[k];

    const comparison =
      k === best
        ? "You selected the round with the lowest validation RMSE."
        : k < best
          ? `You stopped ${best - k} rounds before the best validation round.`
          : `You continued ${k - best} rounds beyond the best validation round.`;

    $("boost-rmse-explanation").innerHTML = `
      <div class="example-explanation">
        <strong>${comparison}</strong>

        <p>
          At round ${k}, training RMSE is
          <strong>${fmt(training)} ${u}</strong>
          and validation RMSE is
          <strong>${fmt(validation)} ${u}</strong>.
        </p>

        <p>
          The lowest validation RMSE is
          <strong>${fmt(gb.best_validation_rmse)} ${u}</strong>
          at round <strong>${best}</strong>.
        </p>

        <p>
          ${k > best
            ? "More rounds have not improved validation RMSE compared with the best round."
            : k === best
              ? "This is the preferred stopping round based on the supplied validation results."
              : "Try adding more trees and watch whether validation error improves."}
        </p>
      </div>
    `;
  }

  $("round").oninput = e => update(Number(e.target.value));

  $("boost-start").onclick = () => update(0);

  $("boost-next").onclick = () =>
    update(Math.min(maxRound, state.round + 1));

  $("boost-best").onclick = () => update(best);

  $("boost-reveal").onclick = () => {
    const answer = $("boost-answer");
    answer.hidden = !answer.hidden;

    $("boost-reveal").textContent = answer.hidden
      ? "Reveal answer"
      : "Hide answer";
  };

  update(r);
}

// ==================================================
// GRADIENT BOOSTING: PREDICTION CHART
// ==================================================

function predictionChart(staged, round, u) {
  const W = 800;
  const H = 260;

  const left = 65;
  const right = 25;
  const top = 35;
  const bottom = 45;

  const lo = Math.min(...staged);
  const hi = Math.max(...staged);
  const padding = Math.max((hi - lo) * 0.15, 1);

  const yMin = lo - padding;
  const yMax = hi + padding;

  const maxRound = staged.length - 1;

  const x = i =>
    left + i / Math.max(1, maxRound) * (W - left - right);

  const y = v =>
    H - bottom -
    (v - yMin) / (yMax - yMin) * (H - top - bottom);

  const path = staged.map((v, i) =>
    `${i === 0 ? "M" : "L"}${x(i)},${y(v)}`
  ).join(" ");

  return `
    <svg
      viewBox="0 0 ${W} ${H}"
      role="img"
      aria-label="Prediction by boosting round"
      style="
        display:block;
        width:100%;
        background:white;
        border:1px solid #dce3f4;
        border-radius:16px;
        padding:12px;
        box-sizing:border-box;
      "
    >
      <line
        x1="${left}"
        y1="${H - bottom}"
        x2="${W - right}"
        y2="${H - bottom}"
        stroke="#cbd2e4"
        stroke-width="2"
      />

      <path
        d="${path}"
        fill="none"
        stroke="var(--down)"
        stroke-width="3"
        stroke-linecap="round"
        stroke-linejoin="round"
      />

      <line
        x1="${x(round)}"
        x2="${x(round)}"
        y1="${top}"
        y2="${H - bottom}"
        stroke="var(--accent)"
        stroke-width="2"
        stroke-dasharray="6 5"
      />

      <circle
        cx="${x(round)}"
        cy="${y(staged[round])}"
        r="7"
        fill="var(--accent)"
        stroke="white"
        stroke-width="3"
      />

      <text
        x="${left}"
        y="22"
        font-size="15"
        fill="var(--muted)"
      >
        Prediction (${u})
      </text>

      <text
        x="${left}"
        y="${H - 10}"
        font-size="14"
        fill="var(--muted)"
      >
        Round 0
      </text>

      <text
        x="${W - right}"
        y="${H - 10}"
        font-size="14"
        text-anchor="end"
        fill="var(--muted)"
      >
        Round ${maxRound}
      </text>

      <text
        x="${left - 10}"
        y="${y(hi) + 4}"
        font-size="12"
        text-anchor="end"
        fill="var(--muted)"
      >
        ${fmt(hi, 0)}
      </text>

      <text
        x="${left - 10}"
        y="${y(lo) + 4}"
        font-size="12"
        text-anchor="end"
        fill="var(--muted)"
      >
        ${fmt(lo, 0)}
      </text>
    </svg>
  `;
}

// ==================================================
// GRADIENT BOOSTING: RMSE CHART
// ==================================================

function rmseChart(gb, round, u) {
  const W = 800;
  const H = 300;

  const left = 65;
  const right = 25;
  const top = 45;
  const bottom = 50;

  const tr = gb.rmse.train;
  const va = gb.rmse.validation;

  const lo = Math.min(...tr, ...va);
  const hi = Math.max(...tr, ...va);
  const padding = Math.max((hi - lo) * 0.1, 0.5);

  const yMin = Math.max(0, lo - padding);
  const yMax = hi + padding;

  const maxRound = tr.length - 1;

  const x = i =>
    left + i / Math.max(1, maxRound) * (W - left - right);

  const y = v =>
    H - bottom -
    (v - yMin) / (yMax - yMin) * (H - top - bottom);

  const line = arr =>
    arr.map((v, i) =>
      `${i === 0 ? "M" : "L"}${x(i)},${y(v)}`
    ).join(" ");

  const best = gb.best_validation_round;

  return `
    <div style="
      background:white;
      border:1px solid #dce3f4;
      border-radius:16px;
      padding:20px;
      margin:24px 0;
    ">
      <div style="
        display:flex;
        flex-wrap:wrap;
        gap:24px;
        font-size:14px;
        font-weight:700;
        margin-bottom:12px;
      ">
        <span style="color:var(--muted)">
          ● Training RMSE
        </span>

        <span style="color:var(--accent)">
          ● Validation RMSE
        </span>

        <span style="color:var(--down)">
          ◆ Best validation round
        </span>
      </div>

      <svg
        viewBox="0 0 ${W} ${H}"
        role="img"
        aria-label="Training and validation RMSE by boosting round"
        style="display:block;width:100%"
      >
        <line
          x1="${left}"
          y1="${H - bottom}"
          x2="${W - right}"
          y2="${H - bottom}"
          stroke="#cbd2e4"
          stroke-width="2"
        />

        <path
          d="${line(tr)}"
          fill="none"
          stroke="var(--muted)"
          stroke-width="3"
        />

        <path
          d="${line(va)}"
          fill="none"
          stroke="var(--accent)"
          stroke-width="3"
        />

        <line
          x1="${x(round)}"
          x2="${x(round)}"
          y1="${top}"
          y2="${H - bottom}"
          stroke="var(--fg)"
          stroke-width="2"
          stroke-dasharray="5 5"
        />

        <circle
          cx="${x(best)}"
          cy="${y(gb.best_validation_rmse)}"
          r="7"
          fill="var(--down)"
          stroke="white"
          stroke-width="3"
        />

        <circle
          cx="${x(round)}"
          cy="${y(va[round])}"
          r="5"
          fill="var(--accent)"
          stroke="white"
          stroke-width="2"
        />

        <text
          x="${left}"
          y="25"
          font-size="15"
          fill="var(--muted)"
        >
          RMSE (${u})
        </text>

        <text
          x="${left}"
          y="${H - 12}"
          font-size="14"
          fill="var(--muted)"
        >
          Round 0
        </text>

        <text
          x="${W - right}"
          y="${H - 12}"
          font-size="14"
          text-anchor="end"
          fill="var(--muted)"
        >
          Round ${maxRound}
        </text>

        <text
          x="${left - 10}"
          y="${y(hi) + 4}"
          font-size="12"
          text-anchor="end"
          fill="var(--muted)"
        >
          ${fmt(hi, 0)}
        </text>

        <text
          x="${left - 10}"
          y="${y(lo) + 4}"
          font-size="12"
          text-anchor="end"
          fill="var(--muted)"
        >
          ${fmt(lo, 0)}
        </text>
      </svg>

      <p class="note">
        The dashed vertical line shows your selected round.
        The teal dot marks the lowest validation RMSE.
      </p>
    </div>
  `;
}

setup();

