package trust_test

import (
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"testing"

	"golang.org/x/crypto/ed25519"
	"golang.org/x/crypto/nacl/sign"

	"github.com/envkey/envkey/public/sdks/envkey-source/crypto"
	"github.com/envkey/envkey/public/sdks/envkey-source/trust"
	"github.com/stretchr/testify/assert"
)

var ownerId = "owner-id"
var ownerSigningPubkey, ownerSigningPrivkey, _ = sign.GenerateKey(rand.Reader)
var ownerPubkey = &crypto.Pubkey{
	Keys: crypto.EncryptionAndSigningKeys{
		SigningKey:    base64.StdEncoding.EncodeToString(ownerSigningPubkey[:]),
		EncryptionKey: "",
	},
	Signature: "",
}

var adminId = "admin-id"
var adminInviteSigningPubkey, adminInviteSigningPrivkey, _ = sign.GenerateKey(rand.Reader)
var adminInviteKeys = crypto.EncryptionAndSigningKeys{
	SigningKey:    base64.StdEncoding.EncodeToString(adminInviteSigningPubkey[:]),
	EncryptionKey: "",
}
var adminInviteJson, _ = json.Marshal(adminInviteKeys)
var adminInviteSig = ed25519.Sign(ownerSigningPrivkey[:], adminInviteJson)
var adminInvitePubkey = &crypto.Pubkey{adminInviteKeys, base64.StdEncoding.EncodeToString(adminInviteSig)}

var adminSigningPubkey, adminSigningPrivkey, _ = sign.GenerateKey(rand.Reader)
var adminKeys = crypto.EncryptionAndSigningKeys{
	SigningKey:    base64.StdEncoding.EncodeToString(adminSigningPubkey[:]),
	EncryptionKey: "",
}
var adminJson, _ = json.Marshal(adminKeys)
var adminSig = ed25519.Sign(adminInviteSigningPrivkey[:], adminJson)
var adminPubkey = &crypto.Pubkey{adminKeys, base64.StdEncoding.EncodeToString(adminSig)}

var devId = "dev-id"
var devInviteSigningPubkey, devInviteSigningPrivkey, _ = sign.GenerateKey(rand.Reader)
var devInviteKeys = crypto.EncryptionAndSigningKeys{
	SigningKey:    base64.StdEncoding.EncodeToString(devInviteSigningPubkey[:]),
	EncryptionKey: "",
}
var devInviteJson, _ = json.Marshal(devInviteKeys)
var devInviteSig = ed25519.Sign(adminSigningPrivkey[:], devInviteJson)
var devInvitePubkey = &crypto.Pubkey{devInviteKeys, base64.StdEncoding.EncodeToString(devInviteSig)}

var devSigningPubkey, devSigningPrivkey, _ = sign.GenerateKey(rand.Reader)
var devKeys = crypto.EncryptionAndSigningKeys{
	SigningKey:    base64.StdEncoding.EncodeToString(devSigningPubkey[:]),
	EncryptionKey: "",
}
var devJson, _ = json.Marshal(devKeys)
var devSig = ed25519.Sign(devInviteSigningPrivkey[:], devJson)
var devPubkey = &crypto.Pubkey{devKeys, base64.StdEncoding.EncodeToString(devSig)}

var _, invalidOwnerSigningPrivkey, _ = sign.GenerateKey(rand.Reader)
var invalidInviteSigningPubkey, invalidInviteSigningPrivkey, _ = sign.GenerateKey(rand.Reader)
var invalidInviteKeys = crypto.EncryptionAndSigningKeys{
	SigningKey:    base64.StdEncoding.EncodeToString(invalidInviteSigningPubkey[:]),
	EncryptionKey: "",
}
var invalidInviteJson, _ = json.Marshal(invalidInviteKeys)
var invalidInviteSig = ed25519.Sign(invalidOwnerSigningPrivkey[:], invalidInviteJson)
var invalidInvitePubkey = &crypto.Pubkey{invalidInviteKeys, base64.StdEncoding.EncodeToString(invalidInviteSig)}

var invalidSigningPubkey, invalidSigningPrivkey, _ = sign.GenerateKey(rand.Reader)
var invalidKeys = crypto.EncryptionAndSigningKeys{
	SigningKey:    base64.StdEncoding.EncodeToString(invalidSigningPubkey[:]),
	EncryptionKey: "",
}
var invalidJson, _ = json.Marshal(invalidKeys)
var invalidSig = ed25519.Sign(invalidInviteSigningPrivkey[:], invalidJson)
var invalidPubkey = &crypto.Pubkey{invalidKeys, base64.StdEncoding.EncodeToString(invalidSig)}

var owner = trust.TrustedKeyable{ownerPubkey, nil, ""}
var admin = trust.TrustedKeyable{adminPubkey, adminInvitePubkey, ownerId}
var dev = trust.TrustedKeyable{devPubkey, devInvitePubkey, adminId}
var invalidAdmin = trust.TrustedKeyable{invalidPubkey, invalidInvitePubkey, adminId}
var trustedRoot = trust.TrustedKeyablesMap{"owner-id": owner}
var envTrustedKeyables = trust.TrustedKeyablesChain{
	TrustedRoot: trustedRoot,
	TrustChain:  trust.TrustedKeyablesMap{"admin-id": admin, "invalid-admin-id": invalidAdmin},
}
var inheritanceTrustedKeyables = trust.TrustedKeyablesChain{
	TrustedRoot: trustedRoot,
	TrustChain:  trust.TrustedKeyablesMap{"admin-id": admin, "dev-id": dev},
}
var devInheritanceSigner = &trust.Signer{"dev-id", devPubkey}
var adminSigner = &trust.Signer{"admin-id", adminPubkey}
var invalidSigner = &trust.Signer{"invalid-admin-id", invalidPubkey}

func TestVerifyInviter(t *testing.T) {
	var err error

	err = admin.VerifyInviterOrSigner(&owner)
	assert.Nil(t, err, "Should not return an error.")

	invalidInviter := trust.TrustedKeyable{devPubkey, nil, ""}
	err = admin.VerifyInviterOrSigner(&invalidInviter)
	assert.NotNil(t, err, "Should return an error.")
}

func TestKeyablesMapSignerTrustedKeyable(t *testing.T) {
	var trusted *trust.TrustedKeyable
	var err error

	trustedKeyablesMap := trust.TrustedKeyablesMap{"admin-id": admin}
	trusted, err = trustedKeyablesMap.SignerTrustedKeyable(adminSigner)

	assert.NotNil(t, trusted, "Should return trusted keyable.")
	assert.Nil(t, err, "Should not return an error.")

	trusted, err = trustedKeyablesMap.SignerTrustedKeyable(devInheritanceSigner)

	assert.Nil(t, trusted, "Should return nil for trusted.")
}

func TestTrustedKeyablesChainSignerTrustedKeyable(t *testing.T) {
	var keyable *trust.TrustedKeyable
	var err error

	// Shallow trust chain
	keyable, err = envTrustedKeyables.SignerTrustedKeyable(adminSigner)
	assert.Nil(t, err, "Should not return an error.")
	assert.Equal(t, keyable, &admin, "Should return the trusted keyable.")

	// Deep trust chain
	keyable, err = inheritanceTrustedKeyables.SignerTrustedKeyable(devInheritanceSigner)
	assert.Nil(t, err, "Should not return an error.")
	assert.Equal(t, keyable, &dev, "Should return the trusted keyable.")

	// Invalid shallow
	missingSigner := &trust.Signer{"missing-id", devPubkey}
	_, err = envTrustedKeyables.SignerTrustedKeyable(missingSigner)
	assert.NotNil(t, err, "Should return an error.")

	// Invalid deep
	_, err = inheritanceTrustedKeyables.SignerTrustedKeyable(invalidSigner)
	assert.NotNil(t, err, "Should return an error.")
}
