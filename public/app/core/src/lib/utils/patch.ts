import { applyPatch as _applyPatch } from "rfc6902";
import set from "lodash.set";
import unset from "lodash.unset";

/*
 * workaround for rfc6902 issue with 'add' and 'set' operations on deep paths
 * that don't exist on target object
 */
export const forceApplyPatch: typeof _applyPatch = (object, patch) => {
  const res = _applyPatch(object, patch);

  res.forEach((val, i) => {
    const op = patch[i];
    if (val !== null && (op.op == "add" || op.op == "replace")) {
      const path = op.path.split("/").slice(1);
      typeof op.value == "undefined"
        ? unset(object, path)
        : set(object, path, op.value);

      res[i] = null;
    }
  });

  return res;
};
