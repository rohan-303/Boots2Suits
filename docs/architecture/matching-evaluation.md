# Boots2Suits Matching Evaluation & Calibration

## Goal

Provide a deterministic internal workflow to evaluate and calibrate matching quality before shipping scoring changes.

## Dataset

Starter dataset:

- `apps/api/src/matching/eval/data/starter-dataset.json`

Each case contains:

- job input and job persona
- candidate veteran input and veteran persona inputs
- expectations:
  - expected top candidate
  - optional expected top-3 inclusion
  - optional expected full order
  - optional expected reason codes by candidate

## Scoring Config

Default scoring config:

- `apps/api/src/matching/scoringConfig.ts`

Example candidate config:

- `apps/api/src/matching/configs/candidate-emphasis-skill-persona.json`

Scoring config is versioned and validated:
- component feature weights must sum to 1
- hybrid weights (`semantic` + `rule`) must sum to 1
- semantic blend weights (`embedding` + `structured`) must sum to 1

## Run Evaluation

```bash
npm run match:evaluate --workspace @boots2suits/api
```

Optional args:

- `--dataset <path>`
- `--config <path>`
- `--out <report-path>`
- `--embedding-mode structured_fallback|real_embeddings`
- `--embedding-model-version <label>`

When `--embedding-mode real_embeddings` is used in evaluation, the runner can consume
optional `embeddingSimilarity` values from dataset candidate rows to simulate
real embedding semantic behavior reproducibly.

Compare structured-only vs hybrid embedding mode:

```bash
npm run match:evaluate:compare --workspace @boots2suits/api
```

Report artifact is written to:

- `apps/api/reports/matching-eval-*.json`

## Run Calibration Compare

```bash
npm run match:calibrate --workspace @boots2suits/api -- --candidate src/matching/configs/candidate-emphasis-skill-persona.json
```

Optional args:

- `--baseline <path>`
- `--dataset <path>`
- `--out <report-path>`
- `--embedding-mode structured_fallback|real_embeddings`
- `--embedding-model-version <label>`

## Quality Gate

Quality gate baseline config:

- `apps/api/src/matching/eval/baseline/starter-baseline.json`

Run quality gate:

```bash
npm run match:quality-gate --workspace @boots2suits/api
```

The quality gate compares current evaluation results against:

- minimum metric thresholds
- locked baseline metrics with max degradation allowances

CI fails if thresholds are missed or degradation exceeds allowed bounds.

## Developer Inspection Utilities

Inspect pair breakdown:

```bash
npm run match:inspect --workspace @boots2suits/api -- pair --jobId <job-id> --veteranProfileId <veteran-profile-id>
```

Inspect latest ranking for a job:

```bash
npm run match:inspect --workspace @boots2suits/api -- job --jobId <job-id>
```

Inspect latest ranking for a veteran:

```bash
npm run match:inspect --workspace @boots2suits/api -- veteran --veteranProfileId <veteran-profile-id>
```
