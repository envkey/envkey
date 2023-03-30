import { exit } from "../../lib/process";
import { Argv } from "yargs";
import { BaseArgs } from "../../types";
import got from "got";
import * as os from "os";
import * as path from "path";
import * as fs from "fs-extra";
import * as archiver from "archiver";
import FormData from "form-data";
import * as cliProgress from "cli-progress";
import { spinnerWithText, stopSpinner } from "../../lib/spinner";

interface SignedS3PostResponse {
  s3PostData: {
    url: string;
    fields: {
      [key: string]: string;
    };
  };
}

const ERROR_REPORT_URL = "https://error-reports.envkey.com/upload-logs";

export const command = ["report-error"];
export const desc = "Report an EnvKey error and upload recent logs.";
export const builder = (yargs: Argv<BaseArgs>) =>
  yargs
    .option("message", {
      type: "string",
      description: "Error message",
      default: "",
    })
    .option("user", {
      type: "string",
      description: "User ID",
      default: "",
    })
    .option("email", {
      type: "string",
      description: "User email",
      default: "",
    });

export const handler = async (
  argv: BaseArgs & { message?: string; user?: string; email?: string }
): Promise<void> => {
  const { message, user: userId, email } = argv;

  spinnerWithText("Zipping up EnvKey core logs...");
  // Create a zip file from the logs directory
  const logsDir = path.join(os.homedir(), ".envkey", "logs");
  const zipPath = path.join(os.tmpdir(), "envkey_logs.zip");

  await createZipFromDirectory(logsDir, zipPath);
  stopSpinner();

  spinnerWithText("Preparing upload...");
  // Request a signed S3 post URL
  const timestamp = new Date().toISOString();
  const response = await got.post<SignedS3PostResponse>(ERROR_REPORT_URL, {
    json: {
      timestamp,
      message,
      userId,
      email,
    },
    responseType: "json",
  });

  const s3PostData = response.body.s3PostData;

  stopSpinner();

  // Upload the zip file to S3 using the presigned post URL
  await uploadZipToS3(s3PostData, zipPath);

  // need to manually exit process since yargs doesn't properly wait for async handlers
  return exit();
};

async function createZipFromDirectory(
  sourceDir: string,
  zipPath: string
): Promise<void> {
  const output = fs.createWriteStream(zipPath);
  const archive = archiver.create("zip");

  return new Promise((resolve, reject) => {
    output.on("close", resolve);
    archive.on("error", reject);
    archive.pipe(output);
    archive.directory(sourceDir, false);
    archive.finalize();
  });
}

async function uploadZipToS3(s3PostData: any, zipPath: string): Promise<void> {
  const form = new FormData();
  for (const key in s3PostData.fields) {
    form.append(key, s3PostData.fields[key]);
  }

  const zipFile = fs.createReadStream(zipPath);
  form.append("file", zipFile);

  // Create a progress bar
  const progressBar = new cliProgress.SingleBar(
    {},
    cliProgress.Presets.shades_classic
  );
  let uploadedBytes = 0;
  const fileSize = await fs.stat(zipPath).then((stats) => stats.size);
  progressBar.start(fileSize, uploadedBytes);

  // Update the progress bar when data is uploaded
  zipFile.on("data", (chunk) => {
    uploadedBytes += chunk.length;
    progressBar.update(uploadedBytes);
  });

  // Complete the progress bar when the upload is finished
  zipFile.on("end", () => {
    progressBar.stop();
  });

  await got.post(s3PostData.url, {
    body: form,
    headers: form.getHeaders(),
  });
}
