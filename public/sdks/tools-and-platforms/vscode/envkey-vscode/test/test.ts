import { programs, ENV_VAR_NAME } from "./programs";
import { dockerfiles } from "./dockerfiles";
import { regexes } from "../src/lib/languages";
import * as fs from "fs";
import { execSync } from "child_process";

if (!process.env[ENV_VAR_NAME]) {
  console.log(
    "\x1b[31m%s\x1b[0m",
    `${ENV_VAR_NAME} environment variable not set.`
  );
  process.exit(1);
}

const noCheck = Boolean(process.env.NO_CHECK);
const noBuild = Boolean(process.env.NO_BUILD);
const buildOnly = process.env.BUILD_ONLY
  ? new Set(process.env.BUILD_ONLY.split(","))
  : null;

const EXPECTED_OUTPUT = `Hello, ${process.env[ENV_VAR_NAME]}`;

function convertToBytes(size: string): number {
  const number = parseFloat(size);
  const unit = size.slice(-2);

  switch (unit) {
    case "GB":
      return number * (1024 * 1024 * 1024);
    case "MB":
      return number * (1024 * 1024);
    case "KB":
      return number * 1024;
    case "B":
      return number;
    default:
      return NaN;
  }
}

function run() {
  // Remove the "examples" folder if it exists recursively
  if (fs.existsSync("examples")) {
    execSync(`rm -rf examples`);
    console.log("\x1b[32m%s\x1b[0m", "Removed existing 'examples' folder");
  }

  // Create the "examples" folder
  fs.mkdirSync("examples");
  console.log("\x1b[32m%s\x1b[0m", "Created 'examples' folder");

  for (const language in programs) {
    if (buildOnly && !buildOnly.has(language)) {
      continue;
    }

    if (!noBuild) {
      // Calculate the total size of Docker containers and images
      const dockerSizeCommand = `docker system df --format "{{.Size}}"`;
      const stdout = execSync(dockerSizeCommand).toString();

      // Parse the output to calculate the total size in bytes
      const sizes = stdout
        .split("\n")
        .filter((size) => size.trim().length > 0)
        .map(convertToBytes)
        .filter((size) => !isNaN(size));

      const totalSizeInBytes = sizes.reduce((acc, size) => acc + size, 0);
      const totalSizeInGB = totalSizeInBytes / (1024 * 1024 * 1024);

      console.log("Total Docker size: ", totalSizeInGB.toFixed(2), "GB");

      // Check if the total size exceeds the threshold
      if (totalSizeInGB > 50) {
        console.error(
          "\x1b[31m%s\x1b[0m",
          "Error: Total Docker size exceeds 50GB"
        );
        return;
      }
    }

    const programConfigs = programs[language];

    const regexConfigs = regexes[language];
    if (!regexConfigs) {
      console.error(
        "\x1b[31m%s\x1b[0m",
        `Error: No regex config for ${language}`
      );
      continue;
    }

    let numProgramConfig = 0;
    for (const programConfig of programConfigs) {
      if (!noCheck) {
        // check that regexes exist and match program
        if (
          !regexConfigs.some((regexConfig) => {
            const autoCompleteRegex = regexConfig.autoCompleteRegex;
            const diagnosticRegex = regexConfig.diagnosticRegex;
            return (
              autoCompleteRegex?.test(programConfig.program) ||
              diagnosticRegex?.test(programConfig.program)
            );
          })
        ) {
          console.error(
            "\x1b[31m%s\x1b[0m",
            `Error: Regexes don't match program for ${language} - ${
              numProgramConfig + 1
            }`
          );
          return;
        }
      }

      if (!noBuild && !programConfig.dockerizable) {
        console.log(
          `Program not dockerizable for ${language} - ${
            numProgramConfig + 1
          } -- SKIPPING`
        );
        continue;
      }

      const dockerfileName = programConfig.dockerfile ?? language;
      const dockerfileContent = dockerfiles[dockerfileName];

      if (!noBuild && !dockerfileContent) {
        console.log(
          `No Dockerfile for ${dockerfileName} - ${
            numProgramConfig + 1
          } -- SKIPPING`
        );
        continue;
      }

      // Directory path for the language
      const baseDirectoryPath = `examples/${language}`;
      let directoryPath = baseDirectoryPath;

      // Create the directory
      fs.mkdirSync(directoryPath, { recursive: true });
      console.log("\x1b[32m%s\x1b[0m", `Created directory: ${directoryPath}`);

      // Use path from config if it exists
      if (programConfig.path) {
        directoryPath = `${directoryPath}/${programConfig.path}`;
        fs.mkdirSync(directoryPath, { recursive: true });
        console.log("\x1b[32m%s\x1b[0m", `Created directory: ${directoryPath}`);
      }

      // Determine the filename
      let filename: string;
      if (programConfig.fileName) {
        filename = programConfig.fileName;
      } else if (programConfig.ext) {
        filename = `hello.${programConfig.ext}`;
      } else {
        console.error(
          "\x1b[31m%s\x1b[0m",
          `Error: No file name or extension for ${language} - ${
            numProgramConfig + 1
          }`
        );
        return;
      }

      // Write the program file
      const programFilePath = `${directoryPath}/${filename}`;
      fs.writeFileSync(programFilePath, programConfig.program);
      console.log(
        "\x1b[32m%s\x1b[0m",
        `Created program file: ${programFilePath}`
      );

      // Write other files if needed
      if (programConfig.otherFiles) {
        for (const otherFileName in programConfig.otherFiles) {
          const otherFilePath = `${baseDirectoryPath}/${otherFileName}`;
          fs.writeFileSync(
            otherFilePath,
            programConfig.otherFiles[otherFileName]
          );
          console.log(
            "\x1b[32m%s\x1b[0m",
            `Created other file: ${otherFilePath}`
          );
        }
      }

      if (dockerfileContent) {
        // Write the Dockerfile
        const dockerfilePath = `${baseDirectoryPath}/Dockerfile`;
        fs.writeFileSync(dockerfilePath, dockerfileContent);
        console.log(
          "\x1b[32m%s\x1b[0m",
          `Created Dockerfile: ${dockerfilePath}`
        );
      }

      if (!noBuild && dockerfileContent) {
        // Build the Docker container
        console.log(
          `Building Docker container for ${language} - ${numProgramConfig + 1}`
        );
        const buildCommand = `docker build -t ${language} ${baseDirectoryPath}`;
        execSync(buildCommand, { stdio: "inherit" });

        // Run the Docker container
        console.log(`Running Docker container for ${dockerfileName}`);
        const runCommand = `docker run -e ${ENV_VAR_NAME}='${process.env[ENV_VAR_NAME]}' ${language}`;

        let runOutput: string;
        try {
          runOutput = execSync(runCommand).toString();
          console.log("\x1b[32m%s\x1b[0m", `Run output: ${runOutput}`);
        } catch (error) {
          if (error instanceof Error) {
            console.error(
              `Error running command "${runCommand}": ${error.message}`
            );
            console.error(
              `Standard error output: ${(error as any).stderr?.toString()}`
            );
          } else {
            console.error(`An unknown error occurred: ${error}`);
          }
          return;
        }

        // Check the output
        if (runOutput.trim() === EXPECTED_OUTPUT) {
          console.log(
            "\x1b[32m%s\x1b[0m",
            `Output matched for ${language} - ${numProgramConfig + 1}\n\n`
          );
        } else {
          console.error(
            "\x1b[31m%s\x1b[0m",
            `Output did not match for ${language} - ${numProgramConfig + 1}`
          );
          return;
        }
      }

      numProgramConfig++;
    }
  }
}

try {
  run();
} catch (error) {
  console.error("\x1b[31m%s\x1b[0m", `Error: ${error}`);
}
