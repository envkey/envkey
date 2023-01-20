import React, {
  useState,
  useLayoutEffect,
  useEffect,
  useCallback,
} from "react";
import { OrgComponent } from "@ui_types";
import { Api } from "@core/types";
import * as g from "@core/lib/graph";
import * as R from "ramda";
import * as ui from "@ui";
import * as styles from "@styles";
import { style } from "typestyle";
import { SmallLoader } from "@images";
import { logAndAlertError } from "@ui_lib/errors";

const DEFAULT_INTEGRATION = "vanta";

export const Integrations: OrgComponent = (props) => {
  const { graph, graphUpdatedAt } = props.core;
  const org = g.getOrg(graph);
  const currentUserId = props.ui.loadedAccountId!;

  const basePathTest = useCallback(() => {
    return props.location.pathname.endsWith("/integrations");
  }, [props.location.pathname]);

  useLayoutEffect(() => {
    window.scrollTo(0, 0);

    if (basePathTest()) {
      props.history.replace(
        props.location.pathname + `/${DEFAULT_INTEGRATION}`
      );
    }
  }, []);

  return (
    <div className={styles.Integrations}>
      {/* <div
        className={
          "integrations-sidebar " +
          style({
            left: props.ui.sidebarWidth,
            height: `calc(100% - ${
              styles.layout.MAIN_HEADER_HEIGHT + props.ui.pendingFooterHeight
            }px)`,
            transition: "height",
            transitionDuration: "0.2s",
          })
        }
      >
        <div>Vanta</div>
      </div> */}
    </div>
  );
};
