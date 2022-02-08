package crypto_test

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"testing"

	"github.com/envkey/envkey/public/sdks/envkey-source/crypto"
	"github.com/stretchr/testify/assert"
	"golang.org/x/crypto/ed25519"
	"golang.org/x/crypto/nacl/box"
	"golang.org/x/crypto/nacl/secretbox"
	"golang.org/x/crypto/nacl/sign"
)

var signingPubkey1, signingPrivkey1, _ = sign.GenerateKey(rand.Reader)
var encryptionPubkey1, encryptionPrivkey1, _ = box.GenerateKey(rand.Reader)
var pubkey1 = &crypto.Pubkey{
	Keys: crypto.EncryptionAndSigningKeys{
		SigningKey:    base64.StdEncoding.EncodeToString(signingPubkey1[:]),
		EncryptionKey: base64.StdEncoding.EncodeToString(encryptionPubkey1[:]),
	},
	Signature: "",
}
var privkey1 = &crypto.Privkey{
	Keys: crypto.EncryptionAndSigningKeys{
		SigningKey:    base64.StdEncoding.EncodeToString(signingPrivkey1[:]),
		EncryptionKey: base64.StdEncoding.EncodeToString(encryptionPrivkey1[:]),
	},
}
var signingPubkey2, signingPrivkey2, _ = sign.GenerateKey(rand.Reader)
var encryptionPubkey2, encryptionPrivkey2, _ = box.GenerateKey(rand.Reader)

var pubkey2keys = crypto.EncryptionAndSigningKeys{
	SigningKey:    base64.StdEncoding.EncodeToString(signingPubkey2[:]),
	EncryptionKey: base64.StdEncoding.EncodeToString(encryptionPubkey2[:]),
}
var pubkey2keysJson, _ = json.Marshal(pubkey2keys)
var pubkey2Sig = ed25519.Sign(signingPrivkey1[:], pubkey2keysJson)

var pubkey2 = &crypto.Pubkey{
	Keys:      pubkey2keys,
	Signature: base64.StdEncoding.EncodeToString(pubkey2Sig[:]),
}
var privkey2 = &crypto.Privkey{
	Keys: crypto.EncryptionAndSigningKeys{
		SigningKey:    base64.StdEncoding.EncodeToString(signingPrivkey2[:]),
		EncryptionKey: base64.StdEncoding.EncodeToString(encryptionPrivkey2[:]),
	},
}
var rnd = make([]byte, 24)
var _, _ = rand.Read(rnd)
var nonce [24]byte
var _ = copy(nonce[:], rnd)

var encryptedBytes = box.Seal([]byte{}, []byte("test message"), &nonce, encryptionPubkey2, encryptionPrivkey1)
var encryptedData = &crypto.EncryptedData{
	Data:  base64.StdEncoding.EncodeToString(encryptedBytes[:]),
	Nonce: base64.StdEncoding.EncodeToString(nonce[:]),
}

var rnd2 = make([]byte, 24)
var _, _ = rand.Read(rnd2)
var symmetricNonce [24]byte
var _ = copy(symmetricNonce[:], rnd2)
var symmetricStringKey = "string-key"
var symmetricKey = sha256.Sum256([]byte(symmetricStringKey))
var encryptedSymmetricBytes = secretbox.Seal([]byte{}, []byte("test message symmetric"), &symmetricNonce, &symmetricKey)
var encryptedSymmetricData = &crypto.EncryptedData{
	Data:  base64.StdEncoding.EncodeToString(encryptedSymmetricBytes[:]),
	Nonce: base64.StdEncoding.EncodeToString(symmetricNonce[:]),
}

var signedCleartext = sign.Sign([]byte{}, []byte("test message"), signingPrivkey1)
var detachedSig = ed25519.Sign(signingPrivkey1[:], []byte("test message"))

func TestEncrypt(t *testing.T) {
	encrypted, err := crypto.Encrypt([]byte("test message"), pubkey1, privkey1)
	assert.Nil(t, err, "Should not return an error")
	assert.NotEqual(t, encrypted.Data, "", "Should return encrypted data.")
	assert.NotEqual(t, encrypted.Nonce, "", "Should return the nonce.")
}

func TestDecrypt(t *testing.T) {
	// with valid keys
	decrypted, err := crypto.Decrypt(encryptedData, pubkey1, privkey2)
	assert.Nil(t, err, "Should not return an error")
	assert.Equal(t, string(decrypted), "test message", "Should decrypt the data")

	// with invalid keys
	decrypted, err = crypto.Decrypt(encryptedData, pubkey2, privkey2)
	assert.NotNil(t, err, "Should return an error")

	decrypted, err = crypto.Decrypt(encryptedData, pubkey1, privkey1)
	assert.NotNil(t, err, "Should return an error")
}

func TestDecryptSymmetric(t *testing.T) {
	// with valid key
	decrypted, err := crypto.DecryptSymmetric(encryptedSymmetricData, []byte(symmetricStringKey))
	assert.Nil(t, err, "Should not return an error")
	assert.Equal(t, string(decrypted), "test message symmetric", "Should decrypt the data")

	// with invalid key
	decrypted, err = crypto.DecryptSymmetric(encryptedSymmetricData, []byte("wrong key"))
	assert.NotNil(t, err, "Should return an error")

	decrypted, err = crypto.DecryptSymmetric(encryptedData, []byte(symmetricStringKey))
	assert.NotNil(t, err, "Should return an error")
}

func TestVerifyDetached(t *testing.T) {
	// with valid key
	err := crypto.VerifyDetached([]byte("test message"), detachedSig, pubkey1)
	assert.Nil(t, err, "Should not return an error")

	// with invalid key
	err = crypto.VerifyDetached([]byte("test message"), detachedSig, pubkey2)
	assert.NotNil(t, err, "Should return an error")
}

func TestVerifySignedCleartext(t *testing.T) {
	// with valid key
	msg, err := crypto.VerifySignedCleartext(signedCleartext, pubkey1)
	assert.Nil(t, err, "Should not return an error")
	assert.Equal(t, string(msg), "test message", "Should return the verified data")

	// with invalid key
	msg, err = crypto.VerifySignedCleartext(signedCleartext, pubkey2)
	assert.NotNil(t, err, "Should return an error")
}

func TestVerifyPubkeySignature(t *testing.T) {
	// with valid key
	err := crypto.VerifyPubkeySignature(pubkey2, pubkey1)
	assert.Nil(t, err, "Should not return an error")

	// with invalid key
	err = crypto.VerifyPubkeySignature(pubkey1, pubkey2)
	assert.NotNil(t, err, "Should return an error")
}

func TestVerifyPubkeyWithPrivkey(t *testing.T) {
	// with valid key
	err := crypto.VerifyPubkeyWithPrivkey(pubkey1, privkey1)
	assert.Nil(t, err, "Should not return an error")

	// with invalid key
	err = crypto.VerifyPubkeyWithPrivkey(pubkey1, privkey2)
	assert.NotNil(t, err, "Should return an error")

	// with valid encryption key but invalid signing key
	err = crypto.VerifyPubkeyWithPrivkey(pubkey1, &crypto.Privkey{
		Keys: crypto.EncryptionAndSigningKeys{
			EncryptionKey: privkey1.Keys.EncryptionKey,
			SigningKey:    privkey2.Keys.SigningKey,
		},
	})
	assert.NotNil(t, err, "Should return an error")

	// with valid signing key but invalid encryption key
	err = crypto.VerifyPubkeyWithPrivkey(pubkey1, &crypto.Privkey{
		Keys: crypto.EncryptionAndSigningKeys{
			EncryptionKey: privkey2.Keys.EncryptionKey,
			SigningKey:    privkey1.Keys.SigningKey,
		},
	})
	assert.NotNil(t, err, "Should return an error")
}
