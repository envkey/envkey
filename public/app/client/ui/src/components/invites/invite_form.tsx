import React, { useState, useMemo, useEffect } from "react";
import { Link } from "react-router-dom";
import { OrgComponent } from "@ui_types";
import { Rbac, Model, Client, Auth, Api, Billing } from "@core/types";
import * as g from "@core/lib/graph";
import * as R from "ramda";
import { inviteRoute } from "./helpers";
import * as styles from "@styles";
import { style } from "typestyle";
import * as z from "zod";
import { SvgImage, SmallLoader } from "@images";
import * as ui from "@ui";
import { graphTypes } from "@core/lib/graph";
import { AddInviteAppForm } from "./add_invite_app_form";
import { AddInviteTeams } from "./add_invite_teams";
import { logAndAlertError } from "@ui_lib/errors";

const emailValidator = z.string().email();

export const InviteForm: OrgComponent<{
  editIndex?: string;
  appId?: string;
}> = (props) => {
  const { graph, graphUpdatedAt, pendingInvites } = props.core;
  const currentUserId = props.ui.loadedAccountId!;
  const appId = props.routeParams.appId;
  const samlProviders = graphTypes(graph).externalAuthProviders.filter(
    (p) => p.provider === "saml"
  );
  const scimProviders = graphTypes(graph).scimProvisioningProviders;
  const editIndex = props.routeParams.editIndex
    ? parseInt(props.routeParams.editIndex)
    : undefined;

  const editingPendingInvite =
    typeof editIndex == "number" ? pendingInvites[editIndex] : undefined;

  // Default to SAML
  const [provider, setProvider] = useState<Auth.AuthProviderType>(
    editingPendingInvite?.user.provider ??
      (samlProviders.length > 0 ? "saml" : "email")
  );
  const [externalAuthProviderId, setExternalAuthProviderId] = useState<
    string | undefined
  >(
    editingPendingInvite?.user.externalAuthProviderId ??
      (samlProviders.length > 0 ? samlProviders[0].id : undefined)
  );

  const [scimProviderId, setScimProviderId] = useState<string | undefined>(
    editingPendingInvite?.scim?.providerId ?? scimProviders?.[0]?.id
  );

  const [loadingScimCandidates, setLoadingScimCandidates] = useState(false);
  const [scimCandidates, setScimCandidates] = useState<
    Model.ScimUserCandidate[]
  >([]);

  const [selectedScimCandidateIds, setSelectedScimCandidateIds] = useState<
    string[]
  >([]);

  const [firstName, setFirstName] = useState(
    editingPendingInvite?.user.firstName ?? ""
  );
  const [lastName, setLastName] = useState(
    editingPendingInvite?.user.lastName ?? ""
  );
  const [email, setEmail] = useState(editingPendingInvite?.user.email ?? "");
  const [submittedEmails, setSubmittedEmails] = useState<string[]>([]);
  const [showAddTeams, setShowAddTeams] = useState(false);
  const [showAddApps, setShowAddApps] = useState(false);

  const [invitableOrgRoleIds, grantableAppIds, grantableUserGroupIds] =
    useMemo(() => {
      let grantableAppIds = g.authz
        .getAccessGrantableApps(graph, currentUserId)
        .map(R.prop("id"));
      if (appId) {
        grantableAppIds = [appId, ...R.without([appId], grantableAppIds)];
      }

      const grantableUserGroupIds = g.authz.hasOrgPermission(
        graph,
        currentUserId,
        "org_manage_teams"
      )
        ? (g.getGroupsByObjectType(graph)["orgUser"] ?? []).map(R.prop("id"))
        : [];

      return [
        g.authz.getInvitableOrgRoles(graph, currentUserId).map(R.prop("id")),
        grantableAppIds,
        grantableUserGroupIds,
      ];
    }, [graphUpdatedAt, currentUserId]);

  const {
    license,
    org,
    currentPrice,
    numActiveDevicesOrPendingInvites,
    numActiveUsersOrPendingInvites,
  } = useMemo(() => {
    const { license, org, subscription } = g.graphTypes(graph);

    const numActiveDevices = org.deviceLikeCount;
    const numActiveUsers = org.activeUserOrInviteCount;
    const numPendingInvites = props.core.pendingInvites.length;
    const numActiveDevicesOrPendingInvites =
      numActiveDevices + numPendingInvites;
    const numActiveUsersOrPendingInvites = numActiveUsers
      ? numActiveUsers + numPendingInvites
      : undefined;

    return {
      license,
      org,
      currentPrice: subscription
        ? (graph[subscription.priceId] as Billing.Price)
        : undefined,
      numActiveDevicesOrPendingInvites,
      numActiveUsersOrPendingInvites,
    };
  }, [graphUpdatedAt, props.core.pendingInvites.length, currentUserId]);

  const [orgRoleId, setOrgRoleId] = useState(
    editingPendingInvite?.user.orgRoleId ??
      invitableOrgRoleIds[invitableOrgRoleIds.length - 1]
  );

  const [initialPending, setInitialPending] = useState<Client.PendingInvite>();

  const grantableAppRoleIdsByAppId = useMemo(
    () =>
      R.mergeAll(
        grantableAppIds.map((id) => ({
          [id]: g.authz
            .getAccessGrantableAppRolesForOrgRole(
              graph,
              currentUserId,
              id,
              orgRoleId
            )
            .map(R.prop("id")),
        }))
      ),
    [graphUpdatedAt, currentUserId, grantableAppIds, orgRoleId]
  );

  const pendingEmails = useMemo(
    () =>
      new Set(
        R.without([editingPendingInvite], props.core.pendingInvites).map(
          (pending) => pending!.user.email
        )
      ),
    [props.core.pendingInvites.length]
  );

  const initialPendingEmails = useMemo(() => pendingEmails, []);

  const activeEmails = useMemo(
    () => new Set(g.getActiveOrgUsers(graph).map(R.prop("email"))),
    [graphUpdatedAt]
  );

  const emailValid = useMemo(
    () => !email || emailValidator.safeParse(email).success,
    [email]
  );

  const defaultAppUserGrants: Required<Client.PendingInvite["appUserGrants"]> =
    appId
      ? [
          {
            appId,
            appRoleId: R.last(grantableAppRoleIdsByAppId[appId])!,
          },
        ]
      : [];

  const [appUserGrantsByAppId, setAppUserGrantsByAppId] = useState<
    Record<string, Required<Client.PendingInvite>["appUserGrants"][0]>
  >(
    R.indexBy(
      R.prop("appId"),
      editingPendingInvite?.appUserGrants ?? defaultAppUserGrants
    )
  );

  const [userGroupIds, setUserGroupIds] = useState<string[]>(
    editingPendingInvite?.userGroupIds ?? []
  );

  const scimCandidatesById = useMemo(
    () => R.indexBy(R.prop("id"), scimCandidates),
    [scimCandidates]
  );

  useEffect(() => {
    if (editingPendingInvite) {
      setInitialPending(getPending());
    }
  }, []);

  useEffect(() => {
    setSelectedScimCandidateIds([]);
    setScimCandidates([]);

    if (!scimProviderId || editingPendingInvite) {
      return;
    }

    setLoadingScimCandidates(true);
    props
      .dispatch({
        type: Api.ActionType.LIST_INVITABLE_SCIM_USERS,
        payload: { id: scimProviderId, all: true },
      })
      .then((res) => {
        if (res.success) {
          const fetchedCandidates = (
            (res.resultAction as any)
              .payload as Api.Net.ApiResultTypes["ListInvitableScimUsers"]
          ).scimUserCandidates.filter((c) => c.active);
          if (fetchedCandidates.length > 0) {
            setScimCandidates(fetchedCandidates);
          }
          // else {
          // test data
          //   setScimCandidates(
          //     R.times<Model.ScimUserCandidate>(
          //       (i) => ({
          //         type: "scimUserCandidate",
          //         id: i.toString(),
          //         orgId: "orgId",
          //         providerId: scimProviderId,
          //         firstName: "User",
          //         lastName: i.toString(),
          //         email: `test${i}@test.com`,
          //         scimUserName: `test${i}@test.com`,
          //         scimDisplayName: `test${i}@test.com`,
          //         scimExternalId: i.toString(),
          //         active: true,
          //         orgUserId: "orgUserId",
          //         createdAt: 0,
          //         updatedAt: 0,
          //       }),
          //       20
          //     )
          //   );
          // }
        }
      })
      .catch((err) => {
        logAndAlertError(`There was a problem listing SCIM users.`, err);
      })
      .finally(() => setLoadingScimCandidates(false));
  }, [scimProviderId]);

  useEffect(() => {
    if (
      submittedEmails.length > 0 &&
      submittedEmails.every((submittedEmail) =>
        pendingEmails.has(submittedEmail)
      )
    ) {
      props.history.push(inviteRoute(props, "/invite-users"));
    }
  }, [pendingEmails]);

  useEffect(() => {
    if (provider === "email") {
      setExternalAuthProviderId(undefined);
    } else if (!externalAuthProviderId) {
      setExternalAuthProviderId(samlProviders[0]?.id);
    }
  }, [provider]);

  const getPending = (scimCandidateId?: string): Client.PendingInvite => {
    const appUserGrants = Object.values(appUserGrantsByAppId);

    const scimCandidate = scimCandidateId
      ? scimCandidatesById[scimCandidateId]
      : undefined;

    const orgRole = graph[orgRoleId] as Rbac.OrgRole;

    return {
      user: {
        provider: provider as "saml" | "email",
        externalAuthProviderId:
          provider === "saml" ? externalAuthProviderId : undefined,
        uid: scimCandidate?.email ?? email,
        email: scimCandidate?.email ?? email,
        firstName: scimCandidate?.firstName ?? firstName,
        lastName: scimCandidate?.lastName ?? lastName,
        orgRoleId,
      },
      appUserGrants:
        !orgRole.autoAppRoleId && appUserGrants.length > 0
          ? appUserGrants
          : undefined,
      userGroupIds:
        !orgRole.autoAppRoleId && userGroupIds.length > 0
          ? userGroupIds
          : undefined,
      scim:
        scimProviderId && scimCandidateId
          ? {
              candidateId: scimCandidateId,
              providerId: scimProviderId,
            }
          : undefined,
    };
  };

  const canSubmit =
    orgRoleId &&
    ((!editingPendingInvite &&
      scimProviderId &&
      selectedScimCandidateIds.length > 0) ||
      (email &&
        firstName &&
        lastName &&
        emailValid &&
        !initialPendingEmails.has(email) &&
        !activeEmails.has(email)));

  const singleUserPending =
    editingPendingInvite || !scimProviderId ? getPending() : undefined;

  const hasChange =
    !editingPendingInvite ||
    !singleUserPending ||
    !R.equals(initialPending, singleUserPending);

  const onSubmit = async () => {
    if (!canSubmit) {
      return;
    }

    if (typeof editIndex == "number" && singleUserPending) {
      const res = await props.dispatch({
        type: Client.ActionType.UPDATE_PENDING_INVITE,
        payload: { index: editIndex, pending: singleUserPending },
      });

      if (res.success) {
        props.history.push(inviteRoute(props, "/invite-users"));
      } else {
        logAndAlertError(
          "There was a problem updating the pending invite.",
          (res.resultAction as any)?.payload
        );
      }
    } else if (scimProviderId) {
      setSubmittedEmails(
        selectedScimCandidateIds.map((id) => scimCandidatesById[id].email)
      );
      let failed = false;
      for (let id of selectedScimCandidateIds) {
        const res = await props.dispatch({
          type: Client.ActionType.ADD_PENDING_INVITE,
          payload: getPending(id),
        });

        if (!res.success) {
          console.error(
            "There was a problem adding the pending invite.",
            (res.resultAction as any)?.payload
          );
        }
      }

      if (failed) {
        logAndAlertError("There was a problem adding the pending invite.");
      }
    } else if (singleUserPending) {
      setSubmittedEmails([email]);

      props
        .dispatch({
          type: Client.ActionType.ADD_PENDING_INVITE,
          payload: singleUserPending,
        })
        .then((res) => {
          if (!res.success) {
            logAndAlertError(
              `There was a problem adding the pending invite.`,
              (res.resultAction as any)?.payload
            );
          }
        });
    }
  };

  let cancelBtn: React.ReactNode;
  if (pendingInvites.length > 0) {
    cancelBtn = (
      <button
        className="secondary"
        onClick={() => {
          props.history.push(inviteRoute(props, "/invite-users"));
        }}
      >
        ← Back
      </button>
    );
  }

  const licenseExpired =
    license.expiresAt != -1 && props.ui.now > license.expiresAt;

  const userLimitExceeded =
    !(currentPrice && currentPrice.interval == "month") &&
    license.maxUsers &&
    numActiveUsersOrPendingInvites &&
    license.maxUsers != -1 &&
    numActiveUsersOrPendingInvites >= license.maxUsers;

  const deviceLimitExceeded =
    !(currentPrice && currentPrice.interval == "month") &&
    license.maxDevices != -1 &&
    numActiveDevicesOrPendingInvites >= license.maxDevices;

  if (deviceLimitExceeded || userLimitExceeded || licenseExpired) {
    let blockStatement: React.ReactNode;

    if (licenseExpired) {
      blockStatement = [
        `Your organization's ${
          license.provisional ? "provisional " : ""
        }license has `,
        <strong>expired.</strong>,
      ];
    } else if (deviceLimitExceeded) {
      blockStatement = [
        "Your organization has reached its limit of ",
        <strong>
          {license.maxDevices} active or pending device
          {license.maxDevices == 1 ? "" : "s"}.
        </strong>,
      ];
    } else {
      blockStatement = [
        "Your organization has reached its limit of ",
        <strong>
          {license.maxUsers!} active or pending user
          {license.maxUsers! == 1 ? "" : "s"}.
        </strong>,
      ];
    }

    const canManageBilling = g.authz.hasOrgPermission(
      graph,
      currentUserId,
      "org_manage_billing"
    );

    return (
      <div className={styles.OrgContainer}>
        <h3>
          {licenseExpired ? "Renew" : "Upgrade"} <strong>License</strong>
        </h3>
        <p>{blockStatement}</p>
        {canManageBilling ? (
          <p>
            To invite someone else, {licenseExpired ? "renew" : "upgrade"} your
            org's license.
          </p>
        ) : (
          <p>
            To invite someone else, ask an admin to{" "}
            {licenseExpired ? "renew" : "upgrade"} your org's license.
          </p>
        )}
        {cancelBtn || canManageBilling ? (
          <div className="buttons">
            {cancelBtn}
            {canManageBilling ? (
              <Link className="primary" to={props.orgRoute("/my-org/billing")}>
                Go To Billing →
              </Link>
            ) : (
              ""
            )}
          </div>
        ) : (
          ""
        )}
      </div>
    );
  }

  const selectedOrgRole = orgRoleId
    ? (graph[orgRoleId] as Rbac.OrgRole)
    : undefined;

  const orgRoleOptions = invitableOrgRoleIds.map((id) => (
    <option value={id} label={(graph[id] as Rbac.OrgRole).name} />
  ));

  const authMethodField =
    org.ssoEnabled &&
    (samlProviders.length > 0 ||
      g.authz.hasOrgPermission(
        graph,
        currentUserId,
        "org_manage_auth_settings"
      )) ? (
      <div className="field">
        <label>Authentication Method</label>
        <div className="select">
          <select
            value={externalAuthProviderId ?? email}
            onChange={(e) => {
              if (e.target.value === "email") {
                setProvider("email");
              } else if (e.target.value == "connect-sso") {
                props.history.push(
                  props.orgRoute(
                    "/my-org/sso?inviteBackPath=" +
                      encodeURIComponent(props.location.pathname)
                  )
                );
              } else {
                setExternalAuthProviderId(e.target.value);
                setProvider("saml");
              }
            }}
          >
            <option value="email">Email</option>
            {samlProviders.length == 0 &&
            g.authz.hasOrgPermission(
              graph,
              currentUserId,
              "org_manage_auth_settings"
            ) ? (
              <option value="connect-sso">SSO</option>
            ) : (
              ""
            )}

            {samlProviders.map((sp) => (
              <option key={sp.id} value={sp.id}>
                {`SSO  →  ${sp.nickname}`}
              </option>
            ))}
          </select>

          <SvgImage type="down-caret" />
        </div>
      </div>
    ) : (
      ""
    );
  const userDirectoryField =
    scimProviders.length > 0 ? (
      <div className="field">
        <label>User Directory</label>
        <div
          className={
            "select" + (Boolean(editingPendingInvite) ? " disabled" : "")
          }
        >
          <select
            value={scimProviderId ?? ""}
            disabled={Boolean(editingPendingInvite)}
            onChange={(e) => {
              setScimProviderId(e.target.value || undefined);
            }}
          >
            <option value="">None</option>
            {scimProviders.map((sc) => (
              <option key={sc.id} value={sc.id}>
                SCIM → {sc.nickname}
              </option>
            ))}
          </select>

          <SvgImage type="down-caret" />
        </div>
      </div>
    ) : null;

  let scimUserFields: React.ReactNode;
  if (scimProviderId) {
    if (editingPendingInvite) {
      scimUserFields = [
        <div className="field">
          <label>Name</label>
          <input type="text" disabled={true} value={firstName} />
          <input type="text" disabled={true} value={lastName} />
        </div>,
        <div className="field">
          <label>Email</label>
          <input disabled={true} type="email" value={email} />
        </div>,
      ];
    } else if (loadingScimCandidates) {
      scimUserFields = (
        <div className="field">
          <label>People To Invite</label>
          <SmallLoader />
        </div>
      );
    } else {
      scimUserFields = (
        <div className="field">
          <label>People To Invite</label>
          <ui.CheckboxMultiSelect
            noSubmitButton={true}
            emptyText={
              <p className="error">
                This user directory doesn't have anyone available to invite.
              </p>
            }
            winHeight={props.winHeight}
            onChange={(ids) => setSelectedScimCandidateIds(ids)}
            items={scimCandidates
              .filter(
                (candidate) =>
                  !activeEmails.has(candidate.email) &&
                  !pendingEmails.has(candidate.email)
              )
              .map((candidate) => {
                const name =
                  `${candidate.firstName ?? ""} ${
                    candidate.lastName ?? ""
                  }`.trim() ||
                  candidate.scimDisplayName ||
                  candidate.scimUserName;
                return {
                  id: candidate.id,
                  searchText: name,
                  label: (
                    <label>
                      {name} <span className="small">{candidate.email}</span>
                    </label>
                  ),
                };
              })}
          />
        </div>
      );
    }
  }

  const form = (
    <form>
      {authMethodField}
      {userDirectoryField}
      {g.authz.hasOrgPermission(
        graph,
        currentUserId,
        "org_manage_auth_settings"
      ) && samlProviders.length + scimProviders.length > 0 ? (
        <div className={"buttons " + style({ marginBottom: 20 })}>
          <button
            className="tertiary"
            onClick={() => {
              props.history.push(
                props.orgRoute(
                  "/my-org/sso?inviteBackPath=" +
                    encodeURIComponent(props.location.pathname)
                )
              );
            }}
          >
            SSO Settings
          </button>
        </div>
      ) : (
        ""
      )}

      {scimUserFields ?? (
        <div>
          <div className="field">
            <label>Name</label>
            <input
              type="text"
              placeholder="Enter the person's first name..."
              autoFocus={true}
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
            />
            <input
              type="text"
              placeholder="Enter the person's last name..."
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
            />
          </div>
          <div className="field">
            <label>Email</label>
            <input
              type="email"
              placeholder="Enter a valid email address..."
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
        </div>
      )}

      {emailValid || email.length < 5 ? (
        ""
      ) : (
        <p className="error">Not a valid email.</p>
      )}
      {initialPendingEmails.has(email) ? (
        <p className="error">
          An invitation for someone with this email is already pending.
        </p>
      ) : (
        ""
      )}
      {activeEmails.has(email) ? (
        <p className="error">
          Someone with this email is already an active member of the
          organization.
        </p>
      ) : (
        ""
      )}

      <div className="field">
        <label>
          Org Role <ui.RoleInfoLink {...props} />
        </label>
        <div className="select">
          <select
            value={orgRoleId}
            onChange={(e) => setOrgRoleId(e.target.value)}
          >
            {orgRoleOptions}
          </select>
          <SvgImage type="down-caret" />
        </div>
      </div>
    </form>
  );

  let teams: React.ReactNode;
  if (
    selectedOrgRole &&
    !selectedOrgRole.autoAppRoleId &&
    grantableUserGroupIds.length > 0
  ) {
    const pendingTeams =
      userGroupIds.length > 0 ? (
        <div className={styles.AssocManager + " " + style({ width: "100%" })}>
          <div className="assoc-list">
            {userGroupIds.map((id) => {
              const team = graph[id] as Model.Group;
              return (
                <div key={id}>
                  <div>
                    <span className="title">{team.name}</span>
                    <div className="actions">
                      <span
                        className="delete"
                        onClick={() =>
                          setUserGroupIds(R.without([id], userGroupIds))
                        }
                      >
                        <SvgImage type="x" />
                        <span>Remove</span>
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="field no-margin">
          <p>
            <strong>This person doesn't yet belong to any teams.</strong>
            <br />
            Note: it's perfectly fine to invite them now and add them to teams
            later. In fact, it may be quicker to do this if you're inviting
            multiple users, since you can add many people to a team at the same
            time once they've all been invited.
            <br />
            You can also grant this person access to individual apps instead, or
            add them teams <strong>and</strong> override their access level to
            specific apps.
          </p>
        </div>
      );

    teams = [
      <h4>Teams</h4>,
      pendingTeams,
      grantableUserGroupIds.length > userGroupIds.length ? (
        <div className="field buttons">
          <button className="tertiary" onClick={() => setShowAddTeams(true)}>
            Add To {userGroupIds.length > 0 ? "More Teams" : "Teams"}
          </button>
        </div>
      ) : (
        ""
      ),
    ];
  }

  let appRoles: React.ReactNode;
  if (
    selectedOrgRole &&
    !selectedOrgRole.autoAppRoleId &&
    grantableAppIds.length > 0
  ) {
    const sortedApps = R.sortWith(
      [
        R.ascend(({ appRoleId }) => {
          const appRole = graph[appRoleId] as Rbac.AppRole;
          return appRole.orderIndex;
        }),
        R.ascend(({ appId }) => {
          const app = graph[appId] as Model.App;
          return app.name;
        }),
      ],

      Object.values(appUserGrantsByAppId)
    );

    const pendingApps =
      sortedApps.length > 0 ? (
        <div className={styles.AssocManager + " " + style({ width: "100%" })}>
          <div className="assoc-list">
            {sortedApps.map(({ appId, appRoleId }) => {
              const app = graph[appId] as Model.App;
              const appRole = graph[appRoleId] as Rbac.AppRole;
              return (
                <div key={appId}>
                  <div>
                    <span className="title">{app.name}</span>
                  </div>
                  <div>
                    <span className="role">{appRole.name} Access</span>
                    <div className="actions">
                      <span
                        className="delete"
                        onClick={() =>
                          setAppUserGrantsByAppId(
                            R.omit([appId], appUserGrantsByAppId)
                          )
                        }
                      >
                        <SvgImage type="x" />
                        <span>Remove</span>
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="field no-margin">
          {userGroupIds.length > 0 ? (
            <p>
              <strong>No access granted yet to specific apps.</strong>
              <br />
              Note: if a user already had access to an app through a team they
              belong to, setting access for a specific app will override the
              access level granted to them from the team.
            </p>
          ) : (
            <p>
              <strong>This person doesn't yet have access to any apps.</strong>
              <br />
              Note: it's perfectly fine to invite them now and grant access to
              apps later. In fact, it may be quicker to do this if you're
              inviting multiple users, since you can grant many people access to
              an app at the same time once they've all been invited.
            </p>
          )}
        </div>
      );

    appRoles = [
      <h4>App Access</h4>,
      pendingApps,
      grantableAppIds.length > sortedApps.length ? (
        <div className="field buttons">
          <button className="tertiary" onClick={() => setShowAddApps(true)}>
            Add To {sortedApps.length > 0 ? "More Apps" : "Apps"}
          </button>
        </div>
      ) : (
        ""
      ),
    ];
  }

  return (
    <div className={styles.OrgContainer}>
      <h3>
        Send An <strong>Invitation</strong>
      </h3>
      {form}
      {teams}
      {appRoles}
      <div className="buttons">
        {cancelBtn}
        <button
          className="primary"
          onClick={onSubmit}
          disabled={!canSubmit || !hasChange}
        >
          {typeof editIndex == "number" ? "Update" : "Next"}
        </button>
      </div>

      {showAddApps ? (
        <AddInviteAppForm
          {...props}
          grantableAppIds={grantableAppIds}
          grantableAppRoleIdsByAppId={grantableAppRoleIdsByAppId}
          appUserGrantsByAppId={appUserGrantsByAppId}
          onClose={() => setShowAddApps(false)}
          onSubmit={(appRoleId, appIds) => {
            setAppUserGrantsByAppId(
              appIds.reduce(
                (agg, appId) => ({
                  ...agg,
                  [appId]: { appId, appRoleId },
                }),
                appUserGrantsByAppId
              )
            );
            setShowAddApps(false);
          }}
        />
      ) : (
        ""
      )}

      {showAddTeams ? (
        <AddInviteTeams
          {...props}
          grantableUserGroupIds={grantableUserGroupIds}
          userGroupIds={userGroupIds}
          onClose={() => setShowAddTeams(false)}
          onSubmit={(ids) => {
            setUserGroupIds([...userGroupIds, ...ids]);
            setShowAddTeams(false);
          }}
        />
      ) : (
        ""
      )}
    </div>
  );
};
