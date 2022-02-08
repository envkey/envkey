import { decamelize } from "humps";
import chalk from "chalk";
import Table from "cli-table3";
import { Model } from "@core/types";
import { capitalize } from "@core/lib/utils/string";
import * as R from "ramda";

export const printOrgSettings = (org: Model.Org, showKeys?: string[]) => {
  const table = new Table({
    colWidths: [40, 30],
    style: {
      head: [], //disable colors in header cells
    },
  });

  table.push([
    {
      content: chalk.cyan(chalk.bold(org.name + " Settings")),
      colSpan: 2,
    },
  ]);

  for (let categoryName in org.settings) {
    if (categoryName == "envs") {
      continue;
    }

    const category = org.settings[categoryName as keyof Model.OrgSettings];

    if (
      showKeys &&
      !R.any((k) => showKeys.includes(k), Object.keys(category))
    ) {
      continue;
    }

    table.push([
      {
        content: capitalize(categoryName),
        colSpan: 2,
      },
    ]);

    for (let settingKey in category) {
      if (showKeys && !showKeys.includes(settingKey)) {
        continue;
      }
      table.push([
        chalk.bold(decamelize(settingKey).split("_").map(capitalize).join(" ")),
        {
          content: chalk.bold(category[settingKey as keyof typeof category]),
          hAlign: "center",
        },
      ]);
    }
  }

  console.log("");
  console.log(table.toString());
};
