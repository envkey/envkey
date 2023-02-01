import React, { useLayoutEffect, useEffect, useState, useMemo } from "react";
import { EnvManagerComponentProps } from "@ui_types";
import { fetchEnvsIfNeeded, shouldFetchEnvs } from "@ui_lib/envs";
import stableStringify from "fast-json-stable-stringify";
import { getUserEncryptedKeyOrBlobComposite } from "@core/lib/blob";
import * as g from "@core/lib/graph";
import * as R from "ramda";
import { Model } from "@core/types";
import { pick } from "@core/lib/utils/pick";

export const useFetchEnvs = (props: EnvManagerComponentProps) => {
  const currentUserId = props.ui.loadedAccountId!;

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

  const [visibleEnvironments, visibleEnvironmentIds] = useMemo(() => {
    const visibleEnvironments = g.authz.getVisibleBaseEnvironments(
      props.core.graph,
      currentUserId,
      props.envParentId
    );
    const ids = visibleEnvironments.map(R.prop("id"));

    return [visibleEnvironments, ids];
  }, [
    props.envParentId,
    props.core.graphUpdatedAt,
    (props.core.graph[props.envParentId] as Model.EnvParent)?.envsUpdatedAt,
    stableStringify(props.core.envsFetchedAt),
  ]);

  const shouldRefreshState = useMemo(() => {
    if (fetchingIfNeeded || Boolean(shouldFetch)) {
      return false;
    }

    const envParent = props.core.graph[props.envParentId] as Model.EnvParent;
    if (
      !props.core.fetchEnvsErrors[props.envParentId] &&
      envParent.envsUpdatedAt
    ) {
      for (let { id: environmentId, envUpdatedAt } of visibleEnvironments) {
        const envComposite = getUserEncryptedKeyOrBlobComposite({
          environmentId,
          envPart: "env",
        });
        const metaComposite = getUserEncryptedKeyOrBlobComposite({
          environmentId,
          envPart: "meta",
        });

        if (
          envUpdatedAt &&
          !props.core.envs[envComposite] &&
          !props.core.envs[metaComposite]
        ) {
          console.log(
            "missing blobs",
            { environmentId, envComposite, metaComposite },
            g.getObjectName(props.core.graph, environmentId),
            props.core.graph[environmentId]
          );
          return true;
        }
      }
    }

    return false;
  }, [
    props.envParentId,
    props.core.graphUpdatedAt,
    (props.core.graph[props.envParentId] as Model.EnvParent)?.envsUpdatedAt,
    stableStringify(props.core.envsFetchedAt),
    stableStringify(visibleEnvironmentIds),
    fetchingIfNeeded || Boolean(shouldFetch),
    props.core.accountLastActiveAt,
  ]);

  useEffect(() => {
    (async () => {
      if (shouldRefreshState) {
        console.log("fetch_envs_hook refreshCoreState");
        await props.refreshCoreState({ forceUpdate: true });
      }
    })();
  }, [shouldRefreshState]);

  useLayoutEffect(() => {
    (async () => {
      if (shouldFetch) {
        setFetchingIfNeeded(true);
        await fetchEnvsIfNeeded(props, props.envParentId);
        setFetchingIfNeeded(false);
      }
    })();
  }, [stableStringify(shouldFetch)]);

  return fetchingIfNeeded || Boolean(shouldFetch) || shouldRefreshState;
};
