# Experiments Repo

This repository is a collection of standalone experiments. Each experiment lives in its own subfolder and is fully self-contained.

## Structure

```
experiments/
  experiment-name/
    README.md        # What the experiment does and how to run it
    ...              # All code, config, and dependencies for this experiment
```

## Rules

- **One folder per experiment.** Every new experiment gets its own subfolder at the repo root (e.g. `my-new-experiment/`). Do not add code to existing experiment folders unless modifying that specific experiment.
- **Standalone.** Each experiment must be runnable on its own — include its own dependency manifest (`package.json`, `requirements.txt`, `go.mod`, etc.) and any config it needs. Do not rely on root-level files or shared code between experiments.
- **Any language/stack is fine.** Pick whatever fits the experiment best.
- **Include a README.md** in each experiment folder explaining what it does, how to install dependencies, and how to run it.
- **Keep the repo root clean.** Only repo-wide files (like this one) belong at the root. Avoid adding loose scripts or config files outside of experiment folders.
