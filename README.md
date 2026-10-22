# ✦ ModelLab — Explain the Model

**Live App:** https://harrisonf7.github.io/modellab-regression/

An interactive learning app that explains three regression algorithms using real NHANES health data: fasting glucose, blood pressure, and lung function.

## Explore the Three Models

| Section | Direct link | My viewer should walk away knowing… |
|---|---|---|
| Push & Pull (Linear Regression) | [Explore Linear Regression](https://harrisonf7.github.io/modellab-regression/#linear) | How a linear regression model starts with a baseline prediction and adds individual feature contributions to produce its final prediction. |
| Wisdom of the Forest (Random Forest) | [Explore Random Forest](https://harrisonf7.github.io/modellab-regression/#forest) | How multiple decision trees make different predictions and how averaging their outputs creates a more stable prediction. |
| One Correction at a Time (Gradient Boosting) | [Explore Gradient Boosting](https://harrisonf7.github.io/modellab-regression/#boosting) | How trees sequentially correct prediction errors and why validation performance helps determine when to stop adding trees. |

## About ModelLab

ModelLab teaches machine learning concepts through interactive experiments.

Visitors can explore three real health datasets, examine different participants, and interact with each algorithm to understand how its predictions are constructed.

The app includes interactive visualizations, explanations, and knowledge checks.

## Run Locally

From the project directory:

```bash
python3 -m http.server 8000
```

Then open http://localhost:8000 in your browser.

## Project Files

- `index.html` — Website structure and styling
- `app.js` — Interactive learning sections
- `m10.js` — Model calculations and data loading
- `outputs/` — Precomputed model outputs
- `data/` — NHANES health datasets
- `AGENT_BRIEF.md` — Original project instructions
- `check.md` — Reference values for validating the app

## Submission

Submit this GitHub repository link on Canvas:

https://github.com/HarrisonF7/modellab-regression
