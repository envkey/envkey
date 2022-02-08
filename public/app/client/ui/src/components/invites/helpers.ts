import { getEnvParentPath } from "@ui_lib/paths";
import { OrgComponentProps } from "@ui_types";
import { Model } from "@core/types";

export const inviteRoute = <T extends OrgComponentProps<any>>(
  props: T,
  path: string
) => {
  const appId = props.routeParams.appId as string;
  const routePrefix = appId
    ? getEnvParentPath(props.core.graph[appId] as Model.App) +
      "/collaborators/list/add"
    : "";

  return props.orgRoute(routePrefix + path);
};
