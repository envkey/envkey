import { getEnvParentPath } from "@ui_lib/paths";
import { OrgComponentProps } from "@ui_types";
import { Model } from "@core/types";

export const cliUserRoute = (
  props: OrgComponentProps<{ appId?: string }>,
  path: string
) => {
  const appId = props.routeParams.appId;
  const routePrefix = appId
    ? getEnvParentPath(props.core.graph[appId] as Model.App) +
      "/cli-keys/list/add"
    : "";

  return props.orgRoute(routePrefix + path);
};
