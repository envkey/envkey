import React, { useState } from "react";
import { OrgComponent } from "@ui_types";
import { Model, Client, Api } from "@core/types";
import * as styles from "@styles";
import * as g from "@core/lib/graph";
import * as semver from "semver";
import * as R from "ramda";
import ReactMarkdown from "react-markdown";

export const SelfHostedUpgrade: OrgComponent = (props) => {
  const org = g.getOrg(props.core.graph) as Model.Org;
  const currentApiVersion = org.selfHostedVersions?.api;
  const currentInfraVersion = org.selfHostedVersions?.infra;
  const apiUpgradeAvailable = Boolean(
    currentApiVersion &&
      props.core.selfHostedUpgradesAvailable.api?.latest &&
      semver.gt(
        props.core.selfHostedUpgradesAvailable.api.latest,
        currentApiVersion
      )
  );
  const infraUpgradeAvailable = Boolean(
    currentInfraVersion &&
      props.core.selfHostedUpgradesAvailable.infra?.latest &&
      semver.gt(
        props.core.selfHostedUpgradesAvailable.infra.latest,
        currentInfraVersion
      )
  );

  const [upgrading, setUpgrading] = useState(false);

  return (
    <div className={styles.Upgrades}>
      <div className="overlay disabled" />

      <div className="modal">
        <h3>
          Self-Hosted EnvKey <strong>Upgrade Available</strong>
        </h3>

        <p>
          An upgrade is available for your Self-Hosted EnvKey installation.
          <br />
          EnvKey will remain running with no downtime during the upgrade.
        </p>

        <div className="project-changelogs">
          {currentApiVersion && apiUpgradeAvailable ? (
            <div>
              <h5>
                <span>API</span>
                <small>
                  Current <strong>{currentApiVersion}</strong>
                  <span className="sep">●</span> Latest{" "}
                  <strong>
                    {props.core.selfHostedUpgradesAvailable.api?.latest}
                  </strong>
                </small>
              </h5>
              <div className="changelog">
                {R.toPairs(
                  props.core.selfHostedUpgradesAvailable.api!.releaseNotes
                )
                  .filter(([version]) => semver.gt(version, currentApiVersion))
                  .sort(([v1], [v2]) => semver.rcompare(v1, v2))
                  .map(([v, note]) => (
                    <div>
                      <label className="version">{v}</label>

                      <div className="note">
                        <ReactMarkdown>{note}</ReactMarkdown>
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          ) : (
            ""
          )}
          {currentInfraVersion && infraUpgradeAvailable ? (
            <div>
              <h5>
                <span>Infra</span>
                <small>
                  Current <strong>{currentInfraVersion}</strong>
                  <span className="sep">●</span> Latest{" "}
                  <strong>
                    {props.core.selfHostedUpgradesAvailable.infra?.latest}
                  </strong>
                </small>
              </h5>
              <div className="changelog">
                {R.toPairs(
                  props.core.selfHostedUpgradesAvailable.infra!.releaseNotes
                )
                  .filter(([version]) =>
                    semver.gt(version, currentInfraVersion)
                  )
                  .sort(([v1], [v2]) => semver.rcompare(v1, v2))
                  .map(([v, note]) => (
                    <div>
                      <label className="version">{v}</label>

                      <div className="note">
                        <ReactMarkdown>{note}</ReactMarkdown>
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          ) : (
            ""
          )}
        </div>

        <div className="buttons">
          <button
            className="secondary"
            disabled={upgrading}
            onClick={() =>
              props.dispatch({
                type: Client.ActionType.SKIP_SELF_HOSTED_UPGRADE_FOR_NOW,
              })
            }
          >
            Remind Me Later
          </button>
          <button
            className="primary"
            disabled={upgrading}
            onClick={async () => {
              setUpgrading(true);

              const res = await props.dispatch({
                type: Api.ActionType.UPGRADE_SELF_HOSTED,
                payload: {
                  apiVersionNumber:
                    props.core.selfHostedUpgradesAvailable.api?.latest ??
                    currentApiVersion!,
                  infraVersionNumber:
                    props.core.selfHostedUpgradesAvailable.infra?.latest,
                },
              });

              if (res.success) {
                alert(
                  "The upgrade has started. It should finish in 5-30 minutes. You'll get an email when it's complete. There won't be any downtime, and EnvKey will work normally the meantime."
                );
              } else {
                console.log("Upgrade self-hosted error", res.resultAction);
                alert(
                  "There was a problem upgrading your EnvKey Self-Hosted Installation."
                );
              }
            }}
          >
            {upgrading ? "Starting Upgrade..." : "Upgrade To Latest Version"}
          </button>
        </div>
      </div>
    </div>
  );
};
