import React from "react";
import { Component } from "@ui_types";
import { Link } from "react-router-dom";
import { LockLink } from "@ui";
import { HomeContainer } from "./home_container";
import { SvgImage } from "@images";
import * as styles from "@styles";

export const HomeMenu: Component = (props) => {
  const { orgUserAccounts } = props.core;

  return (
    <HomeContainer anchor="center">
      <div className={styles.HomeMenu}>
        <ul className="primary">
          {Object.keys(orgUserAccounts).length > 0 ? (
            <li className="select-org">
              <Link to="/select-account">
                <SvgImage type="list" />
                Your organizations
              </Link>
            </li>
          ) : (
            ""
          )}

          <li className="create-org">
            <Link to="/create-org">
              <SvgImage type="add" />
              Create a new organization
            </Link>
          </li>
          <li className="accept-invite">
            <Link to="/accept-invite">
              <SvgImage type="plane" />
              Accept an invitation
            </Link>
          </li>
        </ul>
        <ul className="secondary">
          <li className="redeem-recovery-key">
            <Link to="/redeem-recovery-key">
              <SvgImage type="restore" />
              Recover Account
            </Link>
          </li>
          <li className="redeem-recovery-key">
            <Link to="/device-settings">
              <SvgImage type="gear" />
              Device Settings
            </Link>
          </li>
          <li className="lock-device">
            <LockLink {...props}>
              <SvgImage type="lock" />
              Lock Device
            </LockLink>
          </li>
        </ul>
      </div>
    </HomeContainer>
  );
};
