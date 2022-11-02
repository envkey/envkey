import { RELEASE_ASSET_REGION } from "./stack-constants";
import * as semver from "semver";
import { Infra } from "@core/types";
import { Credentials, S3, SharedIniFileCredentials } from "aws-sdk";
import fetch from "node-fetch";
import xmlParser from "fast-xml-parser";

// These artifact-helpers must stay agnostic to the environment. Be careful about
// using any stack-constants.

// The AWS SDK simply doesn't work without credentials. For customers to use the S3 API, they must hit it
// directly. That is why below, every customer-used s3 request will be different depending on whether credentials
// were passed to the function.

export const getCredentials = (params: {
  profile?: string;
  creds?: { accessKeyId: string; secretAccessKey: string };
}): Credentials | SharedIniFileCredentials | undefined => {
  if (params.profile) {
    return new SharedIniFileCredentials({
      profile: params.profile,
    });
  }
  if (params.creds) {
    return new Credentials(params.creds);
  }

  return undefined;
};

export const getReleaseObject = async (params: {
  bucket: string;
  key: string;
  profile?: string;
  creds?: { accessKeyId: string; secretAccessKey: string };
  progress?: (downloadedBytes: number, totalBytes: number) => void;
}): Promise<Buffer> => {
  const credentials = getCredentials(params);

  if (credentials) {
    const s3 = new S3({ credentials, region: RELEASE_ASSET_REGION });

    console.log(
      "FETCHING release object from s3:",
      JSON.stringify({ bucket: params.bucket, key: params.key })
    );

    const { Body } = await s3
      .getObject({
        Bucket: params.bucket,
        Key: params.key,
      })
      .promise();

    console.log(
      "FETCHED release object from s3:",
      JSON.stringify({ bucket: params.bucket, key: params.key })
    );

    return Body as Buffer;
  }

  const url = `https://${params.bucket}.s3.amazonaws.com/${params.key}`;

  // console.log("fetching release object:", url);

  const res = await fetch(url);

  // console.log("fetched release object:", url);

  if (params.progress) {
    const totalBytes = Number(res.headers.get("content-length"));
    let downloadedBytes = 0;

    res.body.on("data", (chunk) => {
      downloadedBytes += chunk.length;
      params.progress!(totalBytes, downloadedBytes);
    });
  }

  return res.buffer();
};

export const listObjects = async (params: {
  credentials: Credentials | SharedIniFileCredentials | undefined;
  bucket: string;
  prefix: string;
}): Promise<{ key: string; etag: string }[]> => {
  const { credentials, bucket, prefix } = params;
  let output: { key: string; etag: string }[];
  if (credentials) {
    const s3 = new S3({ region: RELEASE_ASSET_REGION, credentials });
    const res = await s3
      .listObjectsV2({
        Bucket: bucket,
        Prefix: prefix,
        MaxKeys: 1000,
      })
      .promise();
    if (!res.Contents) {
      throw new Error(
        "Unexpected response listing versions: " + JSON.stringify(res)
      );
    }
    output = res.Contents.map((o) => ({
      key: o.Key!,
      // https://github.com/aws/aws-sdk-net/issues/815#issuecomment-352466303
      etag: o.ETag!.replace(/"/g, ""),
    }));
  } else {
    const x = await fetch(
      `https://${bucket}.s3.amazonaws.com/?list-type=2&prefix=${encodeURIComponent(
        prefix
      )}`
    ).then((res) => res.text());
    const parsedX = xmlParser.parse(x) as any;
    const contents = (
      Array.isArray(parsedX?.ListBucketResult?.Contents)
        ? parsedX?.ListBucketResult?.Contents
        : [parsedX?.ListBucketResult?.Contents]
    ) as any[];
    output = contents.map((xmlNode: any) => ({
      key: xmlNode.Key as string,
      etag: xmlNode.ETag as string,
    }));
  }

  return output;
};

// Returns semver version
export const getLatestReleaseVersion = async (params: {
  project: Infra.ProjectType;
  bucket: string;
  profile?: string;
  creds?: { accessKeyId: string; secretAccessKey: string };
}): Promise<string> => {
  const { project, bucket, profile, creds } = params;

  return getReleaseObject({
    bucket,
    key: `latest/${project}-version.txt`,
    profile,
    creds,
  }).then((contents) => {
    const version = contents.toString().trim();

    if (semver.valid(version)) {
      return version;
    } else {
      throw new Error("Invalid version");
    }
  });
};

// tagPrefix like "apienterprise" and currentVersionNumber like "0.0.0"
// returns a list like ["0.0.2", "0.0.1"] with newer first (DESC)
export const listVersionsGTE = async (params: {
  tagPrefix: string;
  currentVersionNumber: string;
  bucket: string;
  profile?: string;
  creds?: { accessKeyId: string; secretAccessKey: string };
}): Promise<string[]> => {
  const credentials = getCredentials(params);
  const fullPrefix = `${params.tagPrefix}/release_notes/`;

  const releaseNotesFiles = await listObjects({
    credentials,
    bucket: params.bucket,
    prefix: fullPrefix,
  });

  const onlyNewerOrSameVersions = releaseNotesFiles
    .map((o) => o.key)
    .map((key) => key.replace(fullPrefix, "").replace(".md", ""))
    .filter(Boolean)
    .filter((version) => semver.valid(version))
    .filter((version) => semver.gte(version, params.currentVersionNumber));
  const descendingVersions = semver.rsort(onlyNewerOrSameVersions);

  return descendingVersions;
};

export const listVersionsGT = async (params: {
  tagPrefix: string;
  currentVersionNumber: string;
  bucket: string;
  profile?: string;
  creds?: { accessKeyId: string; secretAccessKey: string };
}) =>
  listVersionsGTE(params).then((versions) =>
    versions.filter((v) => v != params.currentVersionNumber)
  );

export const readReleaseNotesFromS3 = async (params: {
  project: Infra.ProjectType;
  version: string;
  bucket: string;
  profile?: string;
  creds?: { accessKeyId: string; secretAccessKey: string };
}) => {
  const { project, bucket, version, profile, creds } = params;

  const buffer = await getReleaseObject({
    bucket,
    key: `${project}/release_notes/${version}.md`,
    profile,
    creds,
  });

  return buffer.toString();
};

export const getReleaseAsset = async (params: {
  // <project>-v0.0.0
  releaseTag: string;
  // api.zip, etc
  assetName: string;
  bucket: string;
  profile?: string;
  creds?: { accessKeyId: string; secretAccessKey: string };
  progress?: (downloadedBytes: number, totalBytes: number) => void;
}): Promise<Buffer> => {
  const { profile, creds, bucket, progress } = params;
  const [project, version] = params.releaseTag.split("-v");
  const key = `${project}/release_artifacts/${version}/${params.assetName}`;

  // console.log("getReleaseAsset:", { bucket, key });

  return getReleaseObject({ bucket, key, profile, creds, progress });
};
