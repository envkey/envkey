import React, { useState } from "react";
import { Component } from "@ui_types";
import * as styles from "@styles";
import { Link } from "react-router-dom";
import { HomeContainer } from "../home_container";

export const RegisterChooseOrgType: Component = (props) => {
  const [hostType, setHostType] = useState<
    "cloud" | "community" | "enterprise"
  >("cloud");

  return (
    <HomeContainer>
      <div className={styles.Register + " choose-host"}>
        <h3>
          Choose Your <strong>Host</strong>
        </h3>
        <div className="radio-options">
          <div
            className={hostType == "cloud" ? "selected" : ""}
            onClick={(e) => {
              setHostType("cloud");
            }}
          >
            <div>
              <span className="radio-circle" />
              <label>
                EnvKey <strong>Cloud</strong>
              </label>
            </div>
            <div>
              <p>
                Get started in minutes with highly available, geographically
                redundant, high-security cloud hosting. Zero knowledge
                end-to-end encryption ensures sensitive data is never sent to
                our servers.
              </p>
            </div>
          </div>

          <div
            className={hostType == "enterprise" ? "selected" : ""}
            onClick={(e) => {
              setHostType("enterprise");
            }}
          >
            <div>
              <span className="radio-circle" />
              <label>
                Enterprise <strong>Self-Hosted</strong>
              </label>
            </div>
            <div>
              <p>
                Run EnvKey in your own AWS account on the same auto-scaling,
                highly available, geographically redundant, high-security
                architecture that powers EnvKey Cloud. It takes about an hour to
                install (most of that is waiting for resources to spin up).
              </p>
            </div>
          </div>

          <div
            className={hostType == "community" ? "selected" : ""}
            onClick={(e) => {
              setHostType("community");
            }}
          >
            <div>
              <span className="radio-circle" />
              <label>
                Community <strong>Open Source</strong>
              </label>
            </div>
            <div>
              <p>
                Run Open Source EnvKey on any host. Setup, manage, and scale
                your own infrastructure.
              </p>
            </div>
          </div>
        </div>

        <div className="buttons">
          <button
            className="primary"
            onClick={() => {
              props.history.push(`/register-${hostType}`);
            }}
          >
            Next
          </button>
        </div>

        <div className="home-link">
          <Link to="/home">← Back To Home</Link>
        </div>
      </div>
    </HomeContainer>
  );
};
