import React, { useLayoutEffect, useState, useMemo } from "react";
import { EnvManagerComponentProps } from "@ui_types";
import { fetchEnvsIfNeeded, shouldFetchEnvs } from "@ui_lib/envs";
import stableStringify from "fast-json-stable-stringify";

export const useFetchEnvs = (props: EnvManagerComponentProps) => {
  const [fetchingIfNeeded, setFetchingIfNeeded] = useState(false);

  const shouldFetch = useMemo(
    () => shouldFetchEnvs(props, props.envParentId),
    [
      props.envParentId,
      props.core.graphUpdatedAt,
      stableStringify(props.core.envsFetchedAt),
      stableStringify(props.core.isFetchingEnvs),
    ]
  );

  useLayoutEffect(() => {
    (async () => {
      if (shouldFetch) {
        setFetchingIfNeeded(true);
        await fetchEnvsIfNeeded(props, props.envParentId);
        setFetchingIfNeeded(false);
      }
    })();
  }, [stableStringify(shouldFetch)]);

  return fetchingIfNeeded || Boolean(shouldFetch);
};
