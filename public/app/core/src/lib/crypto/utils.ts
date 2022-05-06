import { codec, hash } from "sjcl";
import { randomBytes } from "tweetnacl";
import { encode as encodeBase58 } from "bs58";
import zxcvbn from "zxcvbn";
import * as crypto from "crypto";

export const sha256 = (s: string) => codec.hex.fromBits(hash.sha256.hash(s)),
  secureRandomAlphanumeric = function (len: number): string {
    const bytes = randomBytes(Math.ceil(len * 0.75));
    return encodeBase58(Buffer.from(bytes)).slice(0, len);
  },
  symmetricEncryptionKey = () => secureRandomAlphanumeric(22),
  validatePassphrase = (val: string, inputs: string[] = []): true | string => {
    if (val.length < 10) {
      return "Must be at least 10 characters.";
    }

    const {
        score,
        feedback: { suggestions, warning },
      } = zxcvbn(val.substr(0, 20), [
        "envkey",
        "passphrase",
        "password",
        ...inputs,
      ]),
      valid = score && score > 3;

    if (valid) {
      return true;
    } else {
      const type = ["horrendously weak", "quite weak", "weak", "mediocre"][
        score
      ];

      let msg =
        "Oops, that doesn't appear to be a strong passphrase. It is estimated to be " +
        type +
        " at best.";

      if (warning) {
        msg += " " + warning + ".";
      }

      if (suggestions && suggestions.length) {
        msg += " " + suggestions.join(" ");
      }

      return msg;
    }
  },
  // Outputs a hash of the cert only, separated every two chars by a colon for readability.
  // This is the standard way SAML providers display cert fingerprints.
  samlFingerprint = (
    pem: string,
    algo: "sha1" | "sha256",
    safe?: boolean
  ): string => {
    const matchedCert = pem.match(
      /-----BEGIN CERTIFICATE-----\s*([\s\S]+?)\s*-----END CERTIFICATE-----/i
    );
    if (!matchedCert || matchedCert.length < 2) {
      if (safe) {
        return "Invalid certificate";
      }
      throw new TypeError(
        `Certificate is invalid format - should be PEM: -----BEGIN CERTIFICATE----- ... -----END CERTIFICATE-----, but got:\n${pem}`
      );
    }
    const certOnly = Buffer.from(matchedCert[1], "base64");
    const hashed = crypto.createHash(algo).update(certOnly).digest("hex");
    const formatHexColonSep = hashed.replace(/(.{2})(?!$)/g, "$1:");

    return formatHexColonSep;
  };
