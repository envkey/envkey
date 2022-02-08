import React, { useLayoutEffect, useState } from "react";
import { EnvManagerComponentProps } from "@ui_types";
import { fetchEnvsIfNeeded } from "@ui_lib/envs";
import stableStringify from "fast-json-stable-stringify";
import { envsNeedFetch } from "@core/lib/client";

export const useFetchEnvs = (props: EnvManagerComponentProps) => {
  const [fetchingIfNeeded, setFetchingIfNeeded] = useState(false);

  useLayoutEffect(() => {
    (async () => {
      setFetchingIfNeeded(true);
      await fetchEnvsIfNeeded(props, props.envParentId);
      setFetchingIfNeeded(false);
    })();
  }, [
    props.envParentId,
    stableStringify(props.core.envsFetchedAt),
    stableStringify(props.core.isFetchingEnvs),
  ]);

  return fetchingIfNeeded || envsNeedFetch(props.core, props.envParentId);
};
