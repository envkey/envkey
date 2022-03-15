import React, {
  useEffect,
  useLayoutEffect,
  useState,
  useMemo,
  useRef,
} from "react";
import {
  OrgComponent,
  UiTree,
  UiNode,
  NavFilter,
  SearchableTree,
} from "@ui_types";
import { flattenTree } from "@ui_lib/ui_tree";
import { Link } from "react-router-dom";
import * as R from "ramda";
import { fuzzySearch } from "@ui_lib/search";
import * as styles from "@styles";
import { SvgImage } from "@images";
import * as g from "@core/lib/graph";

type FlagsById = Record<string, true>;

type Props = {
  defaultExpandTopLevel?: true;
};

const ADD_MENU_CLASS_NAME = "add-menu";

const NAV_FILTER_SEARCH_LABELS: Record<NavFilter, string> = {
  all: "",
  apps: " apps",
  blocks: " blocks",
  orgUsers: " people",
  cliUsers: " CLI keys",
  appGroups: " app groups",
  blockGroups: " block groups",
  teams: " teams",
};

let currentRow = 0;
let scrolledIntoView = false;

export const SearchTree: OrgComponent<{}, Props> = (props) => {
  const { ui, uiTree, orgRoute, defaultExpandTopLevel, core, setUiState } =
    props;
  const currentUserId = ui.loadedAccountId!;
  const { graph, graphUpdatedAt } = core;

  const [rawFilter, setRawFilter] = useState("");
  const [expandedItems, setExpandedItems] = useState<FlagsById>({});
  const [userCollapsedItems, setUserCollapsedItems] = useState<FlagsById>({});
  const [addMenuExpanded, setAddMenuExpanded] = useState(false);

  const searchTreeRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const fn = (e: MouseEvent) => {
      const expandedMenu = (e.target as HTMLElement).closest(
        `.${ADD_MENU_CLASS_NAME}`
      );
      if (expandedMenu) {
        return;
      }
      setAddMenuExpanded(false);
    };

    document.documentElement.addEventListener("click", fn);
    return () => {
      document.documentElement.removeEventListener("click", fn);
    };
  }, []);

  const searchInputRef = useRef<HTMLInputElement>(null);

  let preFilteredTree = useMemo(() => {
    return uiTree.filter(getPreFilterFn(ui.selectedCategoryFilter, 0));
  }, [uiTree, ui.selectedCategoryFilter]);

  const filter = rawFilter.trim().toLowerCase();

  const [flatTree, filteredTree] = useMemo(() => {
    if (preFilteredTree.length == 0) {
      return [[], []];
    }

    const flat = flattenTree(preFilteredTree);
    const searchable = flat.filter(
      R.propOr(false, "searchable")
    ) as SearchableTree;

    let filtered = preFilteredTree;
    if (filter) {
      filtered = search(preFilteredTree, searchable, filter);
    }
    filtered = removeRedundantLabels(filtered);

    return [flat, filtered];
  }, [preFilteredTree, filter]);

  const {
    canFilterApps,
    canFilterBlocks,
    canFilterOrgUsers,
    canFilterCliUsers,

    canFilterTeams,
    canFilterAppGroups,
    canFilterBlockGroups,

    canCreateApp,
    canCreateBlock,
    canInviteUser,
    canCreateCliUser,
    canManageDevices,
    canCreateTeam,
  } = useMemo(() => {
    const { apps, blocks, org } = g.graphTypes(graph);
    const groupsByObjectType = g.getGroupsByObjectType(graph);
    return {
      canFilterApps: apps.length > 0,
      canFilterBlocks: blocks.length > 0,
      canFilterOrgUsers: g.authz.hasOrgPermission(
        graph,
        currentUserId,
        "org_manage_users"
      ),
      canFilterCliUsers:
        g.authz.hasOrgPermission(
          graph,
          currentUserId,
          "org_manage_cli_users"
        ) && g.getActiveCliUsers(graph).length > 0,

      canFilterTeams:
        g.authz.hasOrgPermission(graph, currentUserId, "org_manage_teams") &&
        (groupsByObjectType["orgUser"] ?? []).length > 0,
      canFilterAppGroups:
        g.authz.hasOrgPermission(
          graph,
          currentUserId,
          "org_manage_app_groups"
        ) && (groupsByObjectType["app"] ?? []).length > 0,
      canFilterBlockGroups:
        g.authz.hasOrgPermission(
          graph,
          currentUserId,
          "org_manage_block_groups"
        ) && (groupsByObjectType["block"] ?? []).length > 0,

      canCreateApp: g.authz.canCreateApp(graph, currentUserId),
      canCreateTeam:
        (org.teamsEnabled &&
          g.authz.canManageUserGroups(graph, currentUserId)) ??
        false,
      canCreateBlock: g.authz.canCreateBlock(graph, currentUserId),
      canInviteUser: g.authz.canInviteAny(graph, currentUserId),
      canCreateCliUser: g.authz.canCreateAnyCliUser(graph, currentUserId),
      canManageDevices: g.authz.canManageAnyDevicesOrGrants(
        graph,
        currentUserId
      ),
    };
  }, [graphUpdatedAt]);

  const canFilterAny = [
    canFilterApps,
    canFilterBlocks,
    canFilterOrgUsers,
    canFilterCliUsers,
  ].some(Boolean);

  const canCreateAny = [
    canCreateApp,
    canCreateBlock,
    canInviteUser,
    canCreateCliUser,
    canManageDevices,
    canCreateTeam,
  ].some(Boolean);

  const resolveExpanded = () => {
    if (defaultExpandTopLevel && !filter) {
      const expanded: FlagsById = { ...expandedItems };
      let updatedExpanded = false;
      for (let node of filteredTree) {
        if (node.id && !expanded[node.id] && !userCollapsedItems[node.id]) {
          expanded[node.id] = true;
          updatedExpanded = true;
        }
      }
      if (updatedExpanded) {
        setExpandedItems(expanded);
      }

      expandSelectedOrDefaultIfNeeded(
        selectedExpandedIds(filteredTree),
        expanded
      );
    }
  };

  const resetExpanded = () => {
    if (defaultExpandTopLevel && !filter) {
      const expanded: FlagsById = {};
      for (let node of filteredTree) {
        if (node.id && !userCollapsedItems[node.id]) {
          expanded[node.id] = true;
        }
      }
      setExpandedItems(expanded);
      expandSelectedOrDefaultIfNeeded(
        defaultExpandedIds(filteredTree),
        expanded
      );
      expandSelectedOrDefaultIfNeeded(
        selectedExpandedIds(filteredTree),
        expanded
      );
    } else if (!filter) {
      setExpandedItems({});
      expandSelectedOrDefaultIfNeeded(defaultExpandedIds(filteredTree), {});
      expandSelectedOrDefaultIfNeeded(selectedExpandedIds(filteredTree), {});
    }
  };

  const expandSelectedOrDefaultIfNeeded = (
    ids: string[],
    expandedArg?: FlagsById
  ) => {
    if (ids.length > 0) {
      const expanded: FlagsById = { ...(expandedArg ?? expandedItems) };

      let updated = false;
      for (let id of ids) {
        if (id && !expanded[id]) {
          expanded[id] = true;
          updated = true;
        }
      }
      if (updated) {
        setExpandedItems(expanded);
      }
    }
  };

  const setSelectedRow = () => {
    if (!searchTreeRef.current) {
      return;
    }

    const selectedRow = searchTreeRef.current.querySelectorAll(
      "li.selected"
    )[0] as HTMLLIElement | undefined;
    selectedRow?.classList.remove("selected");

    if (!selectedId) {
      return;
    }

    const toSelect = searchTreeRef.current.querySelector(
      `li#node-${selectedId}`
    ) as HTMLLIElement | undefined;

    toSelect?.classList.add("selected");
  };

  const scrollSelectedIntoView = () => {
    if (!searchTreeRef.current) {
      return;
    }

    const selectedRow = searchTreeRef.current.querySelectorAll(
      "li.selected"
    )[0] as HTMLLIElement | undefined;

    if (selectedRow) {
      const top = selectedRow.offsetTop;
      requestAnimationFrame(() => {
        if (!searchTreeRef.current) {
          return;
        }
        if (
          searchTreeRef.current.scrollTop <
          top - searchTreeRef.current.getBoundingClientRect().height
        ) {
          searchTreeRef.current!.scrollTo(0, top);
          scrolledIntoView = true;
        }
      });
    }
  };

  const defaultExpandedIds = (
    tree: UiTree,
    parentIds: string[] = []
  ): string[] => {
    let res: string[] = [];

    for (let node of tree) {
      if (node.defaultExpanded) {
        res = res.concat([...parentIds, node.id]);
      }

      if (node.tree) {
        const chain = defaultExpandedIds(node.tree, [...parentIds, node.id]);
        if (chain.length > 0) {
          res = res.concat(chain);
        }
      }
    }

    return res;
  };

  const selectedExpandedIds = (
    tree: UiTree,
    parentIds: string[] = []
  ): string[] => {
    let res: string[] = [];

    for (let node of tree) {
      if (node.id == selectedId) {
        res = res.concat([...parentIds, node.id]);
      }

      if (node.tree) {
        const chain = selectedExpandedIds(node.tree, [...parentIds, node.id]);
        if (chain.length > 0) {
          res = res.concat(chain);
        }
      }
    }

    return res.slice(0, -1);
  };

  // when searching expand all
  useEffect(() => {
    if (filter) {
      const expanded: FlagsById = {};
      for (let { id } of flatTree) {
        expanded[id] = true;
      }
      setExpandedItems(expanded);
      scrolledIntoView = false;
    } else {
      resetExpanded();
    }
  }, [filter]);

  const renderSearchFilters = () => {
    if (!canFilterAny) {
      return;
    }
    return (
      <div key="search-tree-categories" className={styles.SearchTreeCategories}>
        <select
          value={ui.selectedCategoryFilter}
          onChange={(e) =>
            setUiState({ selectedCategoryFilter: e.target.value as NavFilter })
          }
        >
          <option key="all" value="all">
            All
          </option>
          <option key="apps" value="apps">
            Apps
          </option>
          {canFilterAppGroups ? (
            <option key="appGroups" value="appGroups">
              App Groups
            </option>
          ) : (
            ""
          )}
          {canFilterBlocks ? (
            <option key="blocks" value="blocks">
              Blocks
            </option>
          ) : (
            ""
          )}
          {canFilterBlockGroups ? (
            <option key="blockGroups" value="blockGroups">
              Block Groups
            </option>
          ) : (
            ""
          )}
          {canFilterOrgUsers ? (
            <option value="orgUsers" key="orgUsers">
              People
            </option>
          ) : (
            ""
          )}
          {canFilterTeams ? (
            <option key="teams" value="teams">
              Teams
            </option>
          ) : (
            ""
          )}
          {canFilterCliUsers ? (
            <option value="cliUsers" key="cliUsers">
              CLI Keys
            </option>
          ) : (
            ""
          )}
        </select>
        <SvgImage type="down-caret" />
      </div>
    );
  };

  const renderAdd = () => {
    if (!canCreateAny) {
      return;
    }

    return (
      <div
        key="search-tree-add"
        className={
          ADD_MENU_CLASS_NAME +
          " " +
          styles.SearchTreeAdd +
          (addMenuExpanded ? " expanded" : "")
        }
      >
        <div onClick={() => setAddMenuExpanded(!addMenuExpanded)}>
          <label>Add</label>
          <SvgImage type="add" />
        </div>

        <ul onClick={() => setAddMenuExpanded(false)}>
          {canCreateApp ? (
            <li key="new-app">
              <Link to={orgRoute("/new-app")}>
                <span>Create App</span>
                <SvgImage type="right-caret" />
              </Link>
            </li>
          ) : (
            ""
          )}
          {canCreateBlock ? (
            <li key="new-block">
              <Link to={orgRoute("/new-block")}>
                <span>Create Block</span>
                <SvgImage type="right-caret" />
              </Link>
            </li>
          ) : (
            ""
          )}
          {canInviteUser ? (
            <li key="invite-user">
              <Link to={orgRoute("/invite-users")}>
                <span>Invite People</span>
                <SvgImage type="right-caret" />
              </Link>
            </li>
          ) : (
            ""
          )}
          {canCreateCliUser ? (
            <li key="new-cli-key">
              <Link to={orgRoute("/new-cli-key")}>
                <span>Create CLI Key</span>
                <SvgImage type="right-caret" />
              </Link>
            </li>
          ) : (
            ""
          )}
          {canManageDevices ? (
            <li key="devices">
              <Link to={orgRoute("/devices")}>
                <span>Authorize Device</span>
                <SvgImage type="right-caret" />
              </Link>
            </li>
          ) : (
            ""
          )}
          {canCreateTeam ? (
            <li key="new-team">
              <Link to={orgRoute("/new-team")}>
                <span>Create Team</span>
                <SvgImage type="right-caret" />
              </Link>
            </li>
          ) : (
            ""
          )}
        </ul>
      </div>
    );
  };

  const renderActions = () => {
    if (!(canFilterAny || canCreateAny)) {
      return;
    }
    return (
      <section key="search-tree-actions" className={styles.SearchTreeActions}>
        {[renderSearchFilters(), renderAdd()]}
      </section>
    );
  };

  const renderSearchTree = (tree: UiTree, nesting = 0): HTMLLIElement[] => {
    let results: UiTree = tree;
    if (nesting > 0) {
      // top-level of tree is already pre-filtered
      results = tree.filter(getPreFilterFn(ui.selectedCategoryFilter, nesting));
    } else {
      currentRow = -1;
    }

    return R.flatten(
      results.map((node) => {
        currentRow++;
        const expanded = Boolean(
          node.id && node.tree?.length && expandedItems[node.id]
        );
        const expandable = Boolean(!expanded && node.id && node.tree?.length);
        const pad =
          nesting > 0
            ? R.times(
                (i) => `<small key="spacer-${i}" class="spacer"></small>`,
                nesting
              ).join("")
            : "";

        let svgType: "triangle" | "dash";
        let toggle: (() => void) | undefined;

        if (expanded) {
          svgType = "triangle";
          toggle = () => {
            setExpandedItems(R.omit([node.id], expandedItems));
            setUserCollapsedItems({ ...expandedItems, [node.id]: true });
          };
        } else if (expandable) {
          svgType = "triangle";
          toggle = () => {
            setUserCollapsedItems(R.omit([node.id], userCollapsedItems));
            setExpandedItems({ ...expandedItems, [node.id]: true });
          };
        } else {
          svgType = "dash";
        }

        const bullet = (
          <span className="bullet" onClick={toggle}>
            <SvgImage type={svgType} />
          </span>
        );

        const content = node.path ? (
          <label>
            <Link to={orgRoute(node.path)}>{node.label}</Link>
            <SvgImage type="right-caret" />
          </label>
        ) : (
          <label>{node.label}</label>
        );

        const classNames = [
          node.header ? "header-row" : "tree-row",
          expandable ? "expandable" : null,
          expanded ? "expanded" : null,
          currentRow % 2 == 0 ? "even" : "odd",
        ].filter(Boolean);

        return [
          <li
            key={node.id ?? node.label}
            id={`node-${node.id}`}
            onClick={() =>
              toggle && (node.header || !node.path) ? toggle() : null
            }
            className={classNames.join(" ")}
          >
            <span className="toggle" onClick={toggle}>
              <span dangerouslySetInnerHTML={{ __html: pad }} />
              {bullet}
            </span>
            {content}
          </li>,
          expanded ? renderSearchTree(node.tree!, nesting + 1) : [],
        ];
      })
    ) as HTMLLIElement[];
  };

  const selectedId = useMemo(() => {
    for (let node of flatTree) {
      if (
        node.path &&
        props.location.pathname.startsWith(props.orgRoute(node.path))
      ) {
        return node.id;
      }
    }
    return null;
  }, [props.location.pathname, flatTree]);

  const [searchTree, setSearchTree] =
    useState<ReturnType<typeof renderSearchTree>>();

  useEffect(() => {
    setSearchTree(
      filteredTree.length > 0 ? renderSearchTree(filteredTree) : undefined
    );
  }, [filteredTree, expandedItems, userCollapsedItems]);

  // expand top level by default
  useLayoutEffect(() => {
    resolveExpanded();
  }, [selectedId]);

  useLayoutEffect(() => {
    if (searchTree) {
      setSelectedRow();
    }
  }, [selectedId, searchTree]);

  useLayoutEffect(() => {
    if (searchTree && !scrolledIntoView && !filter) {
      requestAnimationFrame(scrollSelectedIntoView);
    }
  }, [searchTree, Boolean(searchTreeRef.current), filter]);

  return (
    <div key="search-tree-container" className={styles.SearchTreeContainer}>
      <section
        key="search"
        className={styles.SearchTreeSearch}
        onClick={() => searchInputRef.current?.focus()}
      >
        <SvgImage type="search" />
        <input
          type="text"
          value={rawFilter}
          onChange={(e) => setRawFilter(e.target.value)}
          ref={searchInputRef}
          placeholder={`Search${
            NAV_FILTER_SEARCH_LABELS[ui.selectedCategoryFilter]
          }...`}
        />
      </section>
      {renderActions()}
      <section
        key="search-tree"
        ref={searchTreeRef}
        className={styles.SearchTree}
      >
        <ul>{searchTree}</ul>
      </section>
    </div>
  );
};

const getPreFilterFn =
  (navFilter: NavFilter | undefined, nesting: number) => (node: UiNode) => {
    if (!node.showInTree) {
      return false;
    }
    if (nesting > 0 || !navFilter || navFilter == "all") {
      return true;
    }
    return navFilter === node.id;
  };

const search = (
  uiTree: UiTree,
  searchableTree: SearchableTree,
  filter: string
): UiTree => {
  const { searchRes } = fuzzySearch({
    items: searchableTree,
    textField: "label",
    filter,
    additionalSortFns: [R.ascend((res) => res.item.parentIds.length)],
  });

  const refIndexById: Record<string, number | undefined> = {};
  for (let res of searchRes) {
    const current = refIndexById[res.item.id];
    if (typeof current == "undefined" || res.refIndex < current) {
      refIndexById[res.item.id] = res.refIndex;
    }

    for (let parentId of res.item.parentIds) {
      const current = refIndexById[parentId];
      if (typeof current == "undefined" || res.refIndex < current) {
        refIndexById[parentId] = res.refIndex;
      }
    }
  }

  const filterAndSort = (tree: UiTree): UiTree => {
    const filtered = tree.filter(
      (node) => typeof refIndexById[node.id] != "undefined"
    );

    return R.sortBy((node) => refIndexById[node.id]!, filtered).map((node) =>
      node.tree ? { ...node, tree: filterAndSort(node.tree) } : node
    );
  };

  return filterAndSort(uiTree);
};

const removeRedundantLabels = (uiTree: UiTree): UiTree => {
  return uiTree
    .map((node) => {
      // remove redundant labels
      let subTree = (node.tree ?? []).filter(R.propOr(false, "showInTree"));

      if (
        subTree.length == 1 &&
        subTree[0].tree &&
        (subTree[0].id.endsWith("variables") ||
          subTree[0].id.endsWith("environments") ||
          subTree[0].id.endsWith("sub-environments"))
      ) {
        return {
          ...node,
          path: subTree[0].path,
          tree: removeRedundantLabels(subTree[0].tree),
        };
      }

      return {
        ...node,
        tree: subTree.length > 0 ? removeRedundantLabels(subTree) : undefined,
      };
    })
    .filter(Boolean) as UiTree;
};
