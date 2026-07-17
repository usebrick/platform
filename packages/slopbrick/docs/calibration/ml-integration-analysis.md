# ML Model Integration Analysis for slopbrick

> **Historical research, not an active implementation plan.** Current product
> sequencing lives in the platform [roadmap](../../../../ROADMAP.md) and
> [execution index](../../../../docs/execution/index.json). No bundled ML model
> is approved by this document.

**Date:** 2026-07-09
**Status:** Analysis (not implemented)
**Triggered by:** User question "wont be the package too big?"

## TL;DR

**Yes, the package will get bigger — but the increase is manageable.** A
CodeBERT-based ML detector adds **~150-500 MB** to a currently **~350 MB**
slopbrick install (a **43-143% increase** depending on quantization and
runtime choice). The right path is **ONNX Runtime with a small quantized
model as an opt-in feature**, NOT a hard requirement.

---

## Part 1: Current slopbrick footprint

### What we ship today (v0.44.0)

| Component | Size | Notes |
|-----------|-----:|-------|
| Source tarball (`slopbrick-0.43.0.tgz`) | 5.7 MB | npm registry |
| `dist/` compiled JS | 18 MB | bundled code |
| `@swc/core` (TypeScript parser) | ~150 MB | native binary + WASM |
| `tree-sitter` core | 8.6 MB | |
| `tree-sitter-cpp` | 41 MB | |
| `tree-sitter-kotlin` | 31 MB | |
| `tree-sitter-rust` | 7.4 MB | |
| `tree-sitter-swift` | 73 MB | |
| Other deps (chalk, commander, etc.) | ~5 MB | |
| **Total install footprint** | **~350 MB** | |

**Slopbrick is already a heavy package.** The bulk is tree-sitter
grammars and the SWC native binary. Adding a model won't double
the size — but it adds a new heavyweight class.

### The biggest concern: tree-sitter-swift (73MB)

The current package spends 73MB on a grammar that only fires for
`.swift` files. Almost no users scan Swift code. **This is the
single biggest "waste" in the current package** — same as adding a
500MB model that only fires for AI-detection.

**Recommendation:** Move tree-sitter-swift and tree-sitter-kotlin to
**optional dependencies** (`peerDependenciesMeta` or
`optionalDependencies`) so users who don't scan those languages
don't pay the cost. The v0.44.0 plan already considered this for
Dart/Kotlin/Swift but it wasn't executed.

---

## Part 2: ML model options

### CodeBERT-base (the published AI-detection baseline)

Per Nguyen et al. 2023 (GPTSniffer, arXiv:2307.09381), the published
SOTA for AI code detection uses **CodeBERT** (Microsoft, 2020). It's a
RoBERTa-base architecture:

- **Architecture:** 12 layers, 768 hidden, 12 heads, 50K vocab
- **Parameters:** ~125M
- **Max sequence:** 514 tokens (subword BPE tokenizer)
- **Weight size:**
  - float32: 477 MB
  - fp16: 238 MB
  - int8 quantized: 119 MB
- **Inference speed (CPU):** ~50-200ms per snippet (RoBERTa-base)
- **Inference speed (GPU):** ~5-10ms

### CodeBERTa-small (the size-conscious choice)

Hugging Face's `huggingface/CodeBERTa-small-v1`:

- **Architecture:** 6 layers, 768 hidden, 12 heads
- **Parameters:** ~33M (4x smaller than CodeBERT-base)
- **Weight size:**
  - float32: 126 MB
  - fp16: 63 MB
  - int8 quantized: 31 MB
- **F1 on CodeSearchNet:** ~85% (vs CodeBERT-base ~89%)
- **For AI detection:** Nguyen et al. 2023 used CodeBERT-base; CodeBERTa-small
  would lose ~3-5 F1 points but gains 4x smaller model.

### What I'd recommend

**CodeBERTa-small int8 quantized (~31 MB)**, but ONLY after a
**paired-data fine-tune** on the v5 corpus. The published CodeBERT
is pretrained on natural language + code; the AI-detection task
requires fine-tuning on human-vs-AI paired snippets. Per GPTSniffer,
fine-tuning on ~10K paired examples achieves F1 ~85%.

---

## Part 3: How to integrate

### Option A: In-process ONNX Runtime (recommended)

**Approach:** Package the model weights as a separate npm package
(`@slopbrick/model-v1` or similar), use `onnxruntime-node` for
inference. Users opt in via `--use-ai-ml` flag.

| Aspect | Detail |
|--------|--------|
| Model format | ONNX (export from PyTorch via `optimum-cli`) |
| Runtime | `onnxruntime-node` (1.27.0, 2.9M weekly DLs) |
| Runtime size | ~30MB native + 5MB JS (per platform) |
| Model size | 31-238MB depending on quantization |
| **Total add** | **~60-270 MB** |
| **vs current 350MB** | **+17% to +77%** |
| Inference | In-process, 50-200ms per snippet (CPU) |
| Startup | 1-3s model load (one-time per process) |
| GPU support | Yes (CUDA/Metal/DirectML via ORT) |

**Pros:**
- Single process, simple integration
- `onnxruntime-node` is well-maintained by Microsoft
- ONNX is a standard interchange format (model can be re-trained
  with PyTorch, exported to ONNX, used in Node)
- Decent inference speed (sub-second per snippet)

**Cons:**
- +60-270MB install footprint (significant)
- Cold-start latency (1-3s on first scan)
- Native binary download per platform (some CI/CD may not have the
  right glibc)
- Memory at inference: ~1-2GB resident for CodeBERTa-small

### Option B: transformers.js (Hugging Face official)

`@huggingface/transformers` v3 — official Hugging Face port of
Transformers to Node via ONNX.

| Aspect | Detail |
|--------|--------|
| Runtime | ONNX Runtime (WASM or native) |
| **Total add** | **~50-100MB** (model + WASM runtime) |
| vs current | +14% to +29% |
| API | Mirror of Python transformers (Pipeline classes) |
| Inference | Comparable to Option A |

**Pros:**
- Same API as Python (easy to write inference code)
- WASM-only mode (no native binary) — works on more platforms
- Smaller than full onnxruntime-node

**Cons:**
- Heavier wrapper around ONNX (more JS code)
- WASM mode is 3-5x slower than native ONNX
- WASM is single-threaded (no parallelism)

### Option C: Sidecar Python process (most flexible)

**Approach:** slopbrick spawns a Python child process that loads
PyTorch + CodeBERT and returns predictions over stdin/stdout or
HTTP. The Node process orchestrates.

| Aspect | Detail |
|--------|--------|
| Model | PyTorch CodeBERT (full precision or quantized) |
| **Total add** | **0 MB to Node package** (Python is a separate runtime) |
| vs current | **+0%** |
| Inference | Best (PyTorch is the most optimized) |
| User experience | "Please `pip install slopbrick-ml` separately" |

**Pros:**
- **Zero footprint increase** for the Node package
- Best inference performance
- Python ecosystem has the most mature code-AI tooling
- Model can be fine-tuned by users in Python (no JS toolchain)

**Cons:**
- **Requires Python installed** — not all Node users have it
- Process spawn overhead
- IPC complexity (JSON over stdin/stdout is ~5-10ms per call)
- Worse UX for non-Python users (extra setup step)
- Tests of slopbrick-ml need Python in CI

### Option D: Cloud inference API (out of scope)

slopbrick could call a hosted model. Privacy, latency, cost concerns
make this inappropriate for a local-first tool. **Disqualified.**

---

## Part 4: Size comparison

| Option | Total install | vs current 350MB | Notes |
|--------|--------------:|------------------:|-------|
| A (ONNX, full model) | ~610 MB | +74% | 238MB model + 30MB runtime |
| A (ONNX, int8 quantized) | ~480 MB | +37% | 119MB model + 30MB runtime |
| A (ONNX, CodeBERTa-small int8) | ~410 MB | +17% | 31MB model + 30MB runtime |
| B (transformers.js) | ~430 MB | +23% | ~50MB WASM + model |
| C (Python sidecar) | 350 MB | +0% | Python separate |

**Recommended:** Option A with **CodeBERTa-small int8 quantized**
(~+17% to install size, ~50-150ms per inference, fine-tunable).

---

## Part 5: Inference integration in slopbrick

### How it would work

```typescript
// New file: src/ai/model.ts
import * as ort from 'onnxruntime-node';
import { existsSync } from 'node:fs';

let session: ort.InferenceSession | null = null;

export async function loadAIModel(modelPath: string): Promise<void> {
  if (!existsSync(modelPath)) {
    throw new Error(`AI model not found at ${modelPath}. Run \`slopbrick calibrate --train-ai\` first.`);
  }
  session = await ort.InferenceSession.create(modelPath, {
    executionProviders: ['cpu'], // 'cuda' on GPU
    graphOptimizationLevel: 'all',
  });
}

export async function predictAI(features: Float32Array): Promise<number> {
  if (!session) throw new Error('Model not loaded. Call loadAIModel() first.');
  // features: [log_prob_mean, log_prob_std, n_lines, ...]
  // output: 0 (human) to 1 (AI)
  const feeds = { input: new ort.Tensor('float32', features, [1, features.length]) };
  const results = await session.run(feeds);
  return Number(results.output.data[0]);
}
```

### Scan flow with ML

```typescript
// In runScan() / scanFile()
const issues = await scanFileWithHeuristics(filePath);
// NEW: AI ML scoring
if (aiModelEnabled && hasEnoughCode(issues.fileSize)) {
  const features = extractFeatures(facts); // 50-dim vector
  const aiScore = await predictAI(features);
  if (aiScore > 0.7) {
    issues.push({
      ruleId: 'ai/ml-detector',
      message: `ML model: ${(aiScore*100).toFixed(0)}% AI likelihood (codebert-small-v1)`,
      filePath: facts.filePath,
      ...
    });
  }
}
```

### Calibration training flow

```bash
# User runs calibration to fine-tune the model on their corpus
slopbrick calibrate --train-ai --output /path/to/model.onnx
# This:
# 1. Extracts 50-dim feature vectors from v5 corpus
# 2. Trains a small MLP (or fine-tunes CodeBERTa-small)
# 3. Exports to ONNX
# 4. Writes model.onnx
```

The fine-tune is **fast** (~1-5 minutes on a single CPU for an MLP,
~30-60 min for CodeBERTa-small fine-tune on GPU).

---

## Part 6: Tradeoffs and recommendation

### Pros of adding ML

1. **Scientifically backed**: GPTSniffer F1 ~85% is the published
   SOTA, much better than heuristic ~30-50% precision.
2. **Solves the calibration problem**: the v10.2 INVERTED verdicts
   for `ai/*` rules are because heuristics alone don't work. ML
   can learn the multi-feature pattern.
3. **User value**: a real "is this code AI-generated" signal
   is the most-requested feature (per AGENTS.md).
4. **Future-proof**: as LLMs evolve, the model can be re-fine-tuned.

### Cons of adding ML

1. **+17-77% install size** (depending on model size)
2. **+1-3s cold-start** (one-time per scan)
3. **~1-2 GB resident memory** for inference (may be a problem on
   small CI runners or developer laptops with 8GB RAM)
4. **Native binary per platform** (Linux x64, macOS x64+arm64,
   Windows x64 — 3 platforms × 30MB = 90MB of platform binaries
   in the package)
5. **Model needs to be trained** — out-of-the-box CodeBERT is
   pretrained on code; the AI-detection task needs fine-tuning
   on paired data. v5 corpus is a starting point but more
   human/AI pairs needed.
6. **Harder to update** — model is binary, not source.

### Recommendation

**Build it as an opt-in feature, not a default.**

1. **Phase 1 (v0.45.0):** Add `onnxruntime-node` as an
   `optionalDependency`. Users who want AI ML detection run
   `npm install onnxruntime-node` separately.
2. **Phase 2 (v0.46.0):** Add a calibration subcommand that
   fine-tunes a small model on the user's corpus. Export to ONNX.
3. **Phase 3 (v0.47.0):** Bundle the pre-trained model as a
   separate `@slopbrick/model` npm package. Users `npm install
   @slopbrick/model` to get the AI ML detector.
4. **Always opt-in.** The `ai/*` heuristic rules stay `defaultOff`
   for users who don't want any AI-detection. The ML detector
   is also opt-in.

**Alternative:** Ship the model as a separate download (not in
the npm package). User runs `slopbrick download-model` which fetches
~30MB ONNX from a release URL. **Zero impact on package size.**

### Concrete first step

Build a small (50-dim) **logistic regression** model first — not
CodeBERT. Features: log-prob-mean, log-prob-std, n_lines,
avg-line-length, comment-ratio, whitespace-variance, indent-depth
(plus the 15 existing `ai/*` heuristic features). Train on v5
corpus. ~1MB model size, ~10MB total dependency. **80% of the
value at 5% of the size.**

If logistic regression gets F1 > 75%, **ship it**. Then iterate
to CodeBERTa-small only if users want better precision.
