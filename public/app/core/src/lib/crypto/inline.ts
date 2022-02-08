import { Crypto } from "../../types";
import { codec, misc, hash } from "sjcl";
import { box, secretbox, randomBytes, sign as naclSign } from "tweetnacl";
import {
  encodeBase64,
  decodeBase64,
  decodeUTF8,
  encodeUTF8,
} from "tweetnacl-util";

const NONCE_LENGTH = 24,
  KDF_SALT_LENGTH = 24,
  KDF_ITERATIONS = 300000,
  deriveKey = function (passphrase: string, salt: string): string {
    return codec.base64.fromBits(
      misc.pbkdf2(passphrase, codec.base64.toBits(salt), KDF_ITERATIONS)
    );
  };

export const signingKeypair = (): { publicKey: string; secretKey: string } => {
    const { publicKey, secretKey } = naclSign.keyPair();
    return {
      publicKey: encodeBase64(publicKey),
      secretKey: encodeBase64(secretKey),
    };
  },
  encryptionKeypair = (): { publicKey: string; secretKey: string } => {
    const { publicKey, secretKey } = box.keyPair();
    return {
      publicKey: encodeBase64(publicKey),
      secretKey: encodeBase64(secretKey),
    };
  },
  encrypt = function (
    params: { data: string } & Crypto.Keypair
  ): Crypto.EncryptedData {
    const { pubkey, privkey, data } = params,
      nonce = randomBytes(NONCE_LENGTH);

    return {
      nonce: encodeBase64(nonce),
      data: encodeBase64(
        box(
          decodeUTF8(data),
          nonce,
          decodeBase64(pubkey.keys.encryptionKey),
          decodeBase64(privkey.keys.encryptionKey)
        )
      ),
    };
  },
  encryptJson = function (
    params: { data: object } & Crypto.Keypair
  ): Crypto.EncryptedData {
    return encrypt({ ...params, data: JSON.stringify(params.data) });
  },
  encryptSymmetricWithPassphrase = function (params: {
    data: string;
    passphrase: string;
  }): Crypto.PassphraseEncryptedData {
    const { passphrase, data } = params,
      salt = encodeBase64(randomBytes(KDF_SALT_LENGTH)),
      key = decodeBase64(deriveKey(passphrase, salt));

    return {
      ...encryptWithKey({ data, key }),
      salt,
    };
  },
  encryptWithKey = function (params: {
    data: string;
    key: Uint8Array;
  }): Crypto.EncryptedData {
    const nonce = randomBytes(NONCE_LENGTH);

    return {
      nonce: encodeBase64(nonce),
      data: encodeBase64(secretbox(decodeUTF8(params.data), nonce, params.key)),
    };
  },
  decrypt = function (
    params: { encrypted: Crypto.EncryptedData } & Crypto.Keypair
  ): string | null {
    const { encrypted, pubkey, privkey } = params,
      res = box.open(
        decodeBase64(encrypted.data),
        decodeBase64(encrypted.nonce),
        decodeBase64(pubkey.keys.encryptionKey),
        decodeBase64(privkey.keys.encryptionKey)
      );
    return res ? encodeUTF8(res) : null;
  },
  decryptWithPassphrase = function (params: {
    encrypted: Crypto.PassphraseEncryptedData;
    passphrase: string;
  }) {
    const { encrypted, passphrase } = params,
      key = deriveKey(passphrase, encrypted.salt);

    return secretbox.open(
      decodeBase64(encrypted.data),
      decodeBase64(encrypted.nonce),
      decodeBase64(key)
    );
  },
  decryptWithKey = function (params: {
    encrypted: Crypto.EncryptedData;
    encryptionKey: string;
  }) {
    const { encrypted, encryptionKey } = params,
      key = decodeBase64(
        codec.base64.fromBits(hash.sha256.hash(encryptionKey))
      ); // need to do some extra conversions due to sjcl using its own BitArray vs. Uint8Array in NaCl

    return secretbox.open(
      decodeBase64(encrypted.data),
      decodeBase64(encrypted.nonce),
      key
    );
  },
  sign = function (params: {
    data: string;
    privkey: Crypto.Privkey;
  }): Uint8Array {
    const { data, privkey } = params;
    return naclSign(decodeUTF8(data), decodeBase64(privkey.keys.signingKey));
  },
  signJson = function (params: {
    data: object;
    privkey: Crypto.Privkey;
  }): string {
    const signed = sign({ ...params, data: JSON.stringify(params.data) });
    return encodeBase64(signed);
  },
  signDetached = function (params: {
    data: string;
    privkey: Crypto.Privkey;
  }): Uint8Array {
    const { data, privkey } = params;
    return naclSign.detached(
      decodeUTF8(data),
      decodeBase64(privkey.keys.signingKey)
    );
  },
  verify = function (params: {
    signed: string;
    pubkey: Crypto.Pubkey;
  }): Uint8Array | null {
    const { signed, pubkey } = params;
    return naclSign.open(
      decodeBase64(signed),
      decodeBase64(pubkey.keys.signingKey)
    );
  },
  verifyJson = function (params: {
    signed: string;
    pubkey: Crypto.Pubkey;
  }): object | null {
    const res = verify(params);
    if (!res) return null;
    return JSON.parse(encodeUTF8(res));
  },
  verifyDetached = function (params: {
    signed: string;
    signature: string;
    pubkey: Crypto.Pubkey;
  }): boolean {
    const { signed, signature, pubkey } = params;
    return naclSign.detached.verify(
      decodeUTF8(signed),
      decodeBase64(signature),
      decodeBase64(pubkey.keys.signingKey)
    );
  },
  decryptPrivateKey = function (params: {
    encryptedPrivkey: Crypto.EncryptedData;
    encryptionKey: string;
  }): Crypto.Privkey | null {
    const decrypted = decryptWithKey({
      encrypted: params.encryptedPrivkey,
      encryptionKey: params.encryptionKey,
    });

    if (!decrypted) {
      return null;
    }

    return JSON.parse(encodeUTF8(decrypted)) as Crypto.Privkey;
  },
  decryptPrivateKeyWithPassphrase = function (params: {
    encryptedPrivkey: Crypto.PassphraseEncryptedData;
    passphrase: string;
  }): Crypto.Privkey | null {
    const decrypted = decryptWithPassphrase({
      encrypted: params.encryptedPrivkey,
      passphrase: params.passphrase,
    });

    if (!decrypted) {
      return null;
    }

    return JSON.parse(encodeUTF8(decrypted)) as Crypto.Privkey;
  },
  encryptPrivateKey = function (params: {
    privkey: Crypto.Privkey;
    encryptionKey: string;
  }): Crypto.EncryptedData {
    return encryptWithKey({
      key: decodeBase64(
        codec.base64.fromBits(hash.sha256.hash(params.encryptionKey))
      ), // need to do some extra conversions due to sjcl using its own BitArray vs. Uint8Array in NaCl
      data: JSON.stringify(params.privkey),
    });
  },
  encryptSymmetricWithKey = function (params: {
    data: string;
    encryptionKey: string;
  }): Crypto.EncryptedData {
    return encryptWithKey({
      key: decodeBase64(
        codec.base64.fromBits(hash.sha256.hash(params.encryptionKey))
      ), // need to do some extra conversions due to sjcl using its own BitArray vs. Uint8Array in NaCl
      data: params.data,
    });
  },
  decryptSymmetricWithKey = function (params: {
    encrypted: Crypto.EncryptedData;
    encryptionKey: string;
  }) {
    const decrypted = decryptWithKey(params);
    return decrypted ? encodeUTF8(decrypted) : null;
  },
  decryptSymmetricWithPassphrase = function (params: {
    encrypted: Crypto.PassphraseEncryptedData;
    passphrase: string;
  }) {
    const decrypted = decryptWithPassphrase(params);
    return decrypted ? encodeUTF8(decrypted) : null;
  },
  encryptPrivateKeyWithPassphrase = function (params: {
    privkey: Crypto.Privkey;
    passphrase: string;
  }): Crypto.PassphraseEncryptedData {
    return encryptSymmetricWithPassphrase({
      passphrase: params.passphrase,
      data: JSON.stringify(params.privkey),
    });
  },
  signPublicKey = function (params: {
    privkey: Crypto.Privkey;
    pubkey: Crypto.Pubkey;
  }): Crypto.Pubkey {
    const { pubkey, privkey } = params,
      signature = signDetached({
        data: JSON.stringify(pubkey.keys),
        privkey,
      });

    return { ...pubkey, signature: encodeBase64(signature) };
  },
  verifyPublicKeySignature = function (params: {
    signedPubkey: Crypto.Pubkey;
    signerPubkey: Crypto.Pubkey;
  }): boolean {
    const { signedPubkey, signerPubkey } = params;
    return verifyDetached({
      signed: JSON.stringify(signedPubkey.keys),
      pubkey: signerPubkey,
      signature: signedPubkey.signature!,
    });
  };
