"""Outcome-independent shared predictor selection for the NBA model family."""
from __future__ import annotations

import numpy as np

THRESHOLD = 5.0


def vif_values(frame):
    """VIF from centered predictors; no salary or outcome argument is accepted."""
    columns = [key for key in frame.columns if key != "Intercept"]
    x = frame[columns].to_numpy(dtype=float)
    if not np.isfinite(x).all():
        raise ValueError("Selection design must be finite after training-only missingness handling")
    x = x - x.mean(axis=0)
    scale = np.sqrt(np.mean(x * x, axis=0))
    result = {}
    for j, key in enumerate(columns):
        if scale[j] <= 1e-12:
            result[key] = float("inf")
            continue
        target = x[:, j] / scale[j]
        other_indices = [i for i in range(x.shape[1]) if i != j and scale[i] > 1e-12]
        others = x[:, other_indices] / scale[other_indices] if other_indices else np.empty((len(x), 0))
        residual = target - others @ np.linalg.lstsq(others, target, rcond=None)[0]
        unexplained = float(residual @ residual / (target @ target))
        result[key] = 1.0 / unexplained if unexplained > 1e-12 else float("inf")
    return result


def active_columns(frame, retained):
    return [key for key in frame.columns if key != "Intercept" and
            (key in retained or key == "Age" or key.startswith("Unavailable ") and key.removeprefix("Unavailable ") in retained)]


def select_shared(designs, candidate_keys, threshold=THRESHOLD):
    """Drop the eligible stat with the worst group VIF until all VIFs meet target.

    Height and age are retained deliberately. Percentage-availability controls
    remain only while the corresponding percentage is retained. Candidate order
    deterministically breaks ties. Every input is X-only; labels cannot enter.
    """
    retained = list(candidate_keys)
    protected = {"Height", "Age"}
    trace = []
    before = None
    while True:
        current = {group: vif_values(frame[active_columns(frame, retained)]) for group, frame in designs.items()}
        if before is None:
            before = current
        maximum = max(value for values in current.values() for value in values.values())
        if maximum <= threshold + 1e-9:
            break
        eligible = [key for key in retained if key not in protected]
        if not eligible:
            raise ValueError("Protected predictors cannot meet the VIF threshold; do not silently claim success")
        worst = {key: max(values.get(key, 1) for values in current.values()) for key in eligible}
        chosen = max(eligible, key=lambda key: (worst[key], -candidate_keys.index(key)))
        trace.append({"step": len(trace) + 1, "excludedKey": chosen, "worstGroupVif": worst[chosen],
                      "maximumVifBefore": maximum, "groupVifsBefore": {group: values.get(chosen) for group, values in current.items()}})
        retained.remove(chosen)
    return {"policyId": "shared-x-only-vif5-v1", "threshold": threshold, "candidateKeys": list(candidate_keys),
            "retainedKeys": retained, "excludedKeys": [key for key in candidate_keys if key not in retained],
            "protectedKeys": ["Height", "Age"], "perGroupBeforeVifs": before, "perGroupAfterVifs": current,
            "trace": trace, "selectionN": {group: len(frame) for group, frame in designs.items()},
            "rankingPolicy": "Repeatedly remove the unprotected basketball input with the highest VIF in any position; candidate order breaks exact ties. Recompute all VIFs after each removal.",
            "interpretation": "VIF <=5 is a heuristic for limiting redundant linear information, not proof of zero correlation, causality, or independent confirmation."}
