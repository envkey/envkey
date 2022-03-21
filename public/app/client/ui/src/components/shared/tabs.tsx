import React, { useLayoutEffect, useEffect, useState } from "react";
import { OrgComponent, OrgComponentProps } from "@ui_types";
import { Link } from "react-router-dom";
import * as R from "ramda";
import { SvgImage } from "@images";

type Tab = {
  label?: string;
  permitted: () => boolean;
  path: string;
  hidden?: boolean;
};

const Tabs: OrgComponent<
  {},
  {
    tabs: Tab[];
    className?: string;
    collapsible?: boolean;
  }
> = (props) => {
  const [showDropdown, setShowDropdown] = useState(false);

  const tabLinks = props.tabs.map((tab, i) => {
    return tab.hidden ? (
      ""
    ) : (
      <Link
        className={props.location.pathname.includes(tab.path) ? "selected" : ""}
        to={props.match.url + tab.path}
        key={i}
        onClick={() => {
          if (showDropdown) {
            setShowDropdown(false);
          }
          props.setUiState({ lastSelectedTab: tab.path });
        }}
      >
        <label>{tab.label}</label>
      </Link>
    );
  });

  return props.tabs.length > 1 ? (
    <div
      className={
        "tabs " +
        props.className +
        (props.collapsible ? " collapsible" : "") +
        (props.collapsible && showDropdown ? " toggled" : "")
      }
    >
      {props.collapsible ? (
        <span
          className="dropdown-tabs-toggle"
          onClick={() => setShowDropdown(!showDropdown)}
        >
          <SvgImage type="down-caret" />
        </span>
      ) : (
        ""
      )}

      {showDropdown && props.collapsible ? (
        <div className="dropdown-tabs">{tabLinks}</div>
      ) : (
        ""
      )}
      <div className="horizontal-tabs">{tabLinks}</div>
    </div>
  ) : (
    <div />
  );
};

export const useTabs = (
  props: OrgComponentProps<{ orgId: string }>,
  opts: {
    tabs: Tab[];
    className?: string;
    redirectFromBasePath?: true;
    basePathTest?: () => boolean;
    collapsible?: boolean;
  }
) => {
  const { tabs, className, redirectFromBasePath, basePathTest, collapsible } =
    opts;

  const permittedTabs = tabs.filter(({ permitted }) => permitted());
  const permittedPaths = permittedTabs.map(R.prop("path"));

  const shouldRedirectFromBase = redirectFromBasePath && basePathTest?.();

  const selectedPath = permittedPaths.find((path) =>
    props.location.pathname.includes(path)
  );

  const shouldRedirectToDefaultPath = !shouldRedirectFromBase && !selectedPath;

  const defaultPath =
    (props.ui.lastSelectedTab &&
      permittedTabs.find(R.propEq("path", props.ui.lastSelectedTab))?.path) ||
    permittedTabs[0]?.path;

  useLayoutEffect(() => {
    if (shouldRedirectFromBase && defaultPath) {
      props.setUiState({ lastSelectedTab: defaultPath });
      props.history.replace(props.location.pathname + defaultPath);
    }
  }, [shouldRedirectFromBase]);

  useLayoutEffect(() => {
    if (shouldRedirectToDefaultPath && defaultPath) {
      props.setUiState({ lastSelectedTab: defaultPath });
      props.history.replace(props.match.url + defaultPath);
    }
  }, [props.location.pathname, JSON.stringify(permittedPaths)]);

  useEffect(() => {
    if (
      !shouldRedirectFromBase &&
      selectedPath &&
      selectedPath != props.ui.lastSelectedTab
    ) {
      props.setUiState({ lastSelectedTab: selectedPath });
    }
  }, [props.location.pathname, JSON.stringify(permittedPaths)]);

  useEffect(
    () => () => {
      props.setUiState({ lastSelectedTab: undefined });
    },
    []
  );

  const shouldRedirect = shouldRedirectFromBase || shouldRedirectToDefaultPath;

  return {
    shouldRedirect,
    tabsComponent: shouldRedirect ? (
      ""
    ) : (
      <Tabs
        {...props}
        tabs={permittedTabs}
        collapsible={collapsible}
        className={className}
      />
    ),
  };
};
