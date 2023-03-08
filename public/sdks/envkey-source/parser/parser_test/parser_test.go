package parser_test

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"testing"

	"golang.org/x/crypto/ed25519"
	"golang.org/x/crypto/nacl/box"
	"golang.org/x/crypto/nacl/secretbox"
	"golang.org/x/crypto/nacl/sign"

	"github.com/envkey/envkey/public/sdks/envkey-source/crypto"
	"github.com/envkey/envkey/public/sdks/envkey-source/parser"

	"github.com/stretchr/testify/assert"
)

func TestParse(t *testing.T) {
	var envMap parser.EnvMap
	var envJson string
	var err error

	// basic response
	envMap, _, _, _, _, err = response.Parse(encryptionKeyString, false)
	envJson, _ = envMap.ToJson()
	assert.Nil(t, err, "Should not return an error.")
	assert.Equal(t, `{"GO_TEST":"it","GO_TEST_2":"works!"}`, envJson)

	// with inheritance overrides
	envMap, _, _, _, _, err = responseWithInheritance.Parse(encryptionKeyString, false)
	envJson, _ = envMap.ToJson()
	assert.Nil(t, err, "Should not return an error.")
	assert.Equal(t, `{"GO_TEST":"it-inherits","GO_TEST_2":"works!-inherits"}`, envJson)

	// with local overrides
	envMap, _, _, _, _, err = responseWithLocals.Parse(encryptionKeyString, false)
	envJson, _ = envMap.ToJson()
	assert.Nil(t, err, "Should not return an error.")
	assert.Equal(t, `{"GO_TEST":"it-locals","GO_TEST_2":"works!","GO_TEST_4":"works!-locals"}`, envJson)

	// with sub env
	envMap, _, _, _, _, err = responseWithSub.Parse(encryptionKeyString, false)
	envJson, _ = envMap.ToJson()
	assert.Nil(t, err, "Should not return an error.")
	assert.Equal(t, `{"GO_TEST":"it-sub","GO_TEST_2":"works!","GO_TEST_4":"works!-sub"}`, envJson)

	// with blocks
	envMap, _, _, _, _, err = responseWithBlocks.Parse(encryptionKeyString, false)
	envJson, _ = envMap.ToJson()
	assert.Nil(t, err, "Should not return an error.")
	assert.Equal(t, `{"GO_TEST":"it","GO_TEST_2":"works!","GO_TEST_3":"it-block1","GO_TEST_4":"works!-block2"}`, envJson)

	// with blocks and inheritance
	envMap, _, _, _, _, err = responseWithInheritanceAndBlocks.Parse(encryptionKeyString, false)
	envJson, _ = envMap.ToJson()
	assert.Nil(t, err, "Should not return an error.")
	assert.Equal(t, `{"GO_TEST":"it-inherits","GO_TEST_2":"works!-inherits","GO_TEST_3":"it-block1","GO_TEST_4":"works!-block2-inherits"}`, envJson)

	// with blocks / locals / inheritance
	envMap, _, _, _, _, err = responseWithLocalsBlocksInheritance.Parse(encryptionKeyString, false)
	envJson, _ = envMap.ToJson()
	assert.Nil(t, err, "Should not return an error.")
	assert.Equal(t, `{"GO_TEST":"it-locals","GO_TEST_2":"works!-block1-locals","GO_TEST_3":"it-block1","GO_TEST_4":"works!-locals","GO_TEST_5":"works!-block1-locals"}`, envJson)

	// with blocks / sub envs / inheritance
	envMap, _, _, _, _, err = responseWithSubEnvsBlocksInheritance.Parse(encryptionKeyString, false)
	envJson, _ = envMap.ToJson()
	assert.Nil(t, err, "Should not return an error.")
	assert.Equal(t, `{"GO_TEST":"it-sub","GO_TEST_2":"works!-block2-inherits","GO_TEST_3":"it-block1","GO_TEST_4":"works!-sub","GO_TEST_5":"works!-block2-subenv"}`, envJson)

	// with single root pubkey replacement
	envMap, _, newSignedTrustedRoot, replacementIds, _, err := responseWithSingleRootPubkeyReplacement.Parse(encryptionKeyString, false)
	envJson, _ = envMap.ToJson()
	assert.Nil(t, err, "Should not return an error.")
	assert.NotNil(t, newSignedTrustedRoot, "Should return a new signed trusted root to send back to server")
	assert.Equal(t, 1, len(replacementIds))
	assert.Equal(t, `{"GO_TEST":"it","GO_TEST_2":"works!"}`, envJson)

	// with multiple root pubkey replacements
	envMap, _, newSignedTrustedRoot, replacementIds, _, err = responseWithMultiRootPubkeyReplacements.Parse(encryptionKeyString, false)
	envJson, _ = envMap.ToJson()
	assert.Nil(t, err, "Should not return an error.")
	assert.NotNil(t, newSignedTrustedRoot, "Should return a new signed trusted root to send back to server")
	assert.Equal(t, 2, len(replacementIds))
	assert.Equal(t, `{"GO_TEST":"it","GO_TEST_2":"works!"}`, envJson)
}

var ownerId = "owner-id"
var ownerSigningPubkey, ownerSigningPrivkey, _ = sign.GenerateKey(rand.Reader)
var ownerEncPubkey, ownerEncPrivkey, _ = box.GenerateKey(rand.Reader)
var ownerPubkey = &crypto.Pubkey{
	Keys: crypto.EncryptionAndSigningKeys{
		SigningKey:    base64.StdEncoding.EncodeToString(ownerSigningPubkey[:]),
		EncryptionKey: base64.StdEncoding.EncodeToString(ownerEncPubkey[:]),
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
var adminEncPubkey, adminEncPrivkey, _ = box.GenerateKey(rand.Reader)
var adminKeys = crypto.EncryptionAndSigningKeys{
	SigningKey:    base64.StdEncoding.EncodeToString(adminSigningPubkey[:]),
	EncryptionKey: base64.StdEncoding.EncodeToString(adminEncPubkey[:]),
}
var adminJson, _ = json.Marshal(adminKeys)
var adminSig = ed25519.Sign(adminInviteSigningPrivkey[:], adminJson)
var adminPubkey = &crypto.Pubkey{adminKeys, base64.StdEncoding.EncodeToString(adminSig)}
var adminPrivkey = &crypto.Privkey{crypto.EncryptionAndSigningKeys{base64.StdEncoding.EncodeToString(adminSigningPrivkey[:]), base64.StdEncoding.EncodeToString(adminEncPrivkey[:])}}

var admin2Id = "admin2-id"
var admin2InviteSigningPubkey, admin2InviteSigningPrivkey, _ = sign.GenerateKey(rand.Reader)
var admin2InviteKeys = crypto.EncryptionAndSigningKeys{
	SigningKey:    base64.StdEncoding.EncodeToString(admin2InviteSigningPubkey[:]),
	EncryptionKey: "",
}
var admin2InviteJson, _ = json.Marshal(admin2InviteKeys)
var admin2InviteSig = ed25519.Sign(adminSigningPrivkey[:], admin2InviteJson)
var admin2InvitePubkey = &crypto.Pubkey{admin2InviteKeys, base64.StdEncoding.EncodeToString(admin2InviteSig)}

var admin2SigningPubkey, admin2SigningPrivkey, _ = sign.GenerateKey(rand.Reader)
var admin2EncPubkey, admin2EncPrivkey, _ = box.GenerateKey(rand.Reader)
var admin2Keys = crypto.EncryptionAndSigningKeys{
	SigningKey:    base64.StdEncoding.EncodeToString(admin2SigningPubkey[:]),
	EncryptionKey: base64.StdEncoding.EncodeToString(admin2EncPubkey[:]),
}
var admin2Json, _ = json.Marshal(admin2Keys)
var admin2Sig = ed25519.Sign(admin2InviteSigningPrivkey[:], admin2Json)
var admin2Pubkey = &crypto.Pubkey{admin2Keys, base64.StdEncoding.EncodeToString(admin2Sig)}

var admin3Id = "admin3-id"
var admin3InviteSigningPubkey, admin3InviteSigningPrivkey, _ = sign.GenerateKey(rand.Reader)
var admin3InviteKeys = crypto.EncryptionAndSigningKeys{
	SigningKey:    base64.StdEncoding.EncodeToString(admin3InviteSigningPubkey[:]),
	EncryptionKey: "",
}
var admin3InviteJson, _ = json.Marshal(admin3InviteKeys)
var admin3InviteSig = ed25519.Sign(admin2SigningPrivkey[:], admin3InviteJson)
var admin3InvitePubkey = &crypto.Pubkey{admin3InviteKeys, base64.StdEncoding.EncodeToString(admin3InviteSig)}

var admin3SigningPubkey, admin3SigningPrivkey, _ = sign.GenerateKey(rand.Reader)
var admin3EncPubkey, admin3EncPrivkey, _ = box.GenerateKey(rand.Reader)
var admin3Keys = crypto.EncryptionAndSigningKeys{
	SigningKey:    base64.StdEncoding.EncodeToString(admin3SigningPubkey[:]),
	EncryptionKey: base64.StdEncoding.EncodeToString(admin3EncPubkey[:]),
}
var admin3Json, _ = json.Marshal(admin3Keys)
var admin3Sig = ed25519.Sign(admin3InviteSigningPrivkey[:], admin3Json)
var admin3Pubkey = &crypto.Pubkey{admin3Keys, base64.StdEncoding.EncodeToString(admin3Sig)}

var devId = "dev-id"
var devInviteSigningPubkey, devInviteSigningPrivkey, _ = sign.GenerateKey(rand.Reader)
var devInviteKeys = crypto.EncryptionAndSigningKeys{
	SigningKey:    base64.StdEncoding.EncodeToString(devInviteSigningPubkey[:]),
	EncryptionKey: "",
}
var devInviteJson, _ = json.Marshal(devInviteKeys)
var devInviteSig = ed25519.Sign(admin3SigningPrivkey[:], devInviteJson)
var devInvitePubkey = &crypto.Pubkey{devInviteKeys, base64.StdEncoding.EncodeToString(devInviteSig)}

var devSigningPubkey, devSigningPrivkey, _ = sign.GenerateKey(rand.Reader)
var devKeys = crypto.EncryptionAndSigningKeys{
	SigningKey:    base64.StdEncoding.EncodeToString(devSigningPubkey[:]),
	EncryptionKey: "",
}
var devJson, _ = json.Marshal(devKeys)
var devSig = ed25519.Sign(devInviteSigningPrivkey[:], devJson)
var devPubkey = &crypto.Pubkey{devKeys, base64.StdEncoding.EncodeToString(devSig)}

var keyableSigningPubkey, keyableSigningPrivkey, _ = sign.GenerateKey(rand.Reader)
var keyableEncryptionPubkey, keyableEncryptionPrivkey, _ = box.GenerateKey(rand.Reader)
var keyablePubkeyKeys = crypto.EncryptionAndSigningKeys{
	SigningKey:    base64.StdEncoding.EncodeToString(keyableSigningPubkey[:]),
	EncryptionKey: base64.StdEncoding.EncodeToString(keyableEncryptionPubkey[:]),
}
var keyablePubkeyKeysJson, _ = json.Marshal(keyablePubkeyKeys)
var keyableSig = ed25519.Sign(adminSigningPrivkey[:], keyablePubkeyKeysJson)
var pubkey = &crypto.Pubkey{keyablePubkeyKeys, base64.StdEncoding.EncodeToString(adminSig)}
var keyablePrivkey = &crypto.Privkey{crypto.EncryptionAndSigningKeys{base64.StdEncoding.EncodeToString(keyableSigningPrivkey[:]), base64.StdEncoding.EncodeToString(keyableEncryptionPrivkey[:])}}
var keyablePrivkeyJson, _ = json.Marshal(keyablePrivkey)

var encryptionKeyString = "3UVxGywSBjbAvqwd"
var symmetricKey = sha256.Sum256([]byte(encryptionKeyString))

var rnd = make([]byte, 24)
var _, _ = rand.Read(rnd)
var noncePrivkey [24]byte
var _ = copy(noncePrivkey[:], rnd)
var encryptedPrivkeyBytes = secretbox.Seal([]byte{}, keyablePrivkeyJson, &noncePrivkey, &symmetricKey)

var encryptedPrivkey = &crypto.EncryptedData{
	base64.StdEncoding.EncodeToString(encryptedPrivkeyBytes),
	base64.StdEncoding.EncodeToString(noncePrivkey[:]),
}

var envJson = `{"GO_TEST":{"val": "it"},"GO_TEST_2":{"val": "works!"}}`
var envSymmetricKey = `envSymmetricKey`
var encryptedSymmetricKey, _ = crypto.Encrypt([]byte(envSymmetricKey), pubkey, adminPrivkey)
var encryptedEnv = crypto.EncryptSymmetric([]byte(envJson), []byte(envSymmetricKey))

var envForInheritanceJson = `{"GO_TEST":{"inheritsEnvironmentId": "app1-environment1"},"GO_TEST_2":{"inheritsEnvironmentId": "app1-environment1"}}`
var envForInheritanceSymmetricKey = `envForInheritanceSymmetricKey`
var encryptedSymmetricKeyForInheritance, _ = crypto.Encrypt([]byte(envForInheritanceSymmetricKey), pubkey, adminPrivkey)
var encryptedEnvForInheritance = crypto.EncryptSymmetric([]byte(envForInheritanceJson), []byte(envForInheritanceSymmetricKey))

var admin2EnvJson = `{"GO_TEST":{"val": "it"},"GO_TEST_2":{"val": "works!"}}`
var admin2SymmetricKey = `admin2SymmetricKey`
var admin2EncryptedSymmetricKey, _ = crypto.Encrypt([]byte(admin2SymmetricKey), admin2Pubkey, keyablePrivkey)
var admin2EncryptedEnv = crypto.EncryptSymmetric([]byte(admin2EnvJson), []byte(admin2SymmetricKey))

var trustedRootMap = map[string][]interface{}{
	(ownerId): {"root", ownerPubkey, nil, ""},
}
var trustChainMap = map[string][]interface{}{
	(adminId):  {"orgUserDevice", adminPubkey, adminInvitePubkey, ownerId},
	(admin2Id): {"orgUserDevice", admin2Pubkey, admin2InvitePubkey, adminId},
}

var trustedRootJson, _ = json.Marshal(trustedRootMap)
var trustChainJson, _ = json.Marshal(trustChainMap)
var signedTrustedRoot = &crypto.SignedData{
	base64.StdEncoding.EncodeToString(sign.Sign([]byte{}, trustedRootJson, keyableSigningPrivkey)),
}
var encryptedByAdminTrustChain = &crypto.SignedData{
	base64.StdEncoding.EncodeToString(sign.Sign([]byte{}, trustChainJson, adminSigningPrivkey)),
}
var encryptedByAdmin2TrustChain = &crypto.SignedData{
	base64.StdEncoding.EncodeToString(sign.Sign([]byte{}, trustChainJson, admin2SigningPrivkey)),
}

var replacingTrustChain = &crypto.SignedData{
	base64.StdEncoding.EncodeToString(sign.Sign([]byte{}, trustChainJson, admin2SigningPrivkey)),
}

var devTrustChainMap = map[string][]interface{}{
	(adminId):  {"orgUserDevice", adminPubkey, adminInvitePubkey, ownerId},
	(admin2Id): {"orgUserDevice", admin2Pubkey, admin2InvitePubkey, adminId},
	(admin3Id): {"orgUserDevice", admin3Pubkey, admin3InvitePubkey, admin2Id},
	(devId):    {"orgUserDevice", devPubkey, devInvitePubkey, admin3Id},
}
var devTrustChainJson, _ = json.Marshal(devTrustChainMap)
var encryptedByDevTrustChain = &crypto.SignedData{
	base64.StdEncoding.EncodeToString(sign.Sign([]byte{}, devTrustChainJson, devSigningPrivkey)),
}

var replacingTrustChainMap = map[string][]interface{}{
	(adminId): {"orgUserDevice", adminPubkey, adminInvitePubkey, ownerId},
}
var replacingTrustChainJson, _ = json.Marshal(replacingTrustChainMap)

var replacing2TrustChainMap = map[string][]interface{}{
	(admin2Id): {"orgUserDevice", admin2Pubkey, admin2InvitePubkey, adminId},
}
var replacing2TrustChainJson, _ = json.Marshal(replacing2TrustChainMap)

var inheritanceJson = `{"GO_TEST":{"val": "it-inherits"},"GO_TEST_2":{"val": "works!-inherits"}}`
var inheritanceSymmetricKey = `inheritanceSymmetricKey`
var encryptedInheritanceOverridesSymmetricKey, _ = crypto.Encrypt([]byte(inheritanceSymmetricKey), devPubkey, keyablePrivkey)
var encryptedInheritanceOverrides = crypto.EncryptSymmetric([]byte(inheritanceJson), []byte(inheritanceSymmetricKey))
var inheritanceOverridesEncryptedByPubkeyId = devId
var inheritanceOverridesEncryptedByPubkey = devPubkey

var inheritanceOverridesEncryptedByTrustChain = base64.StdEncoding.EncodeToString(sign.Sign([]byte{}, devTrustChainJson, devSigningPrivkey))

var localsJson = `{"GO_TEST":{"val": "it-locals"},"GO_TEST_4":{"val": "works!-locals"}}`
var localsSymmetricKey = `localsSymmetricKey`
var encryptedLocalsSymmetricKey, _ = crypto.Encrypt([]byte(localsSymmetricKey), devPubkey, keyablePrivkey)
var encryptedLocals = crypto.EncryptSymmetric([]byte(localsJson), []byte(localsSymmetricKey))
var localsEncryptedByPubkeyId = devId
var localsEncryptedByPubkey = devPubkey
var localsEncryptedByTrustChain = &crypto.SignedData{
	base64.StdEncoding.EncodeToString(sign.Sign([]byte{}, devTrustChainJson, devSigningPrivkey)),
}

var subJson = `{"GO_TEST":{"val": "it-sub"},"GO_TEST_4":{"val": "works!-sub"}}`
var subSymmetricKey = `subSymmetricKey`
var encryptedSubSymmetricKey, _ = crypto.Encrypt([]byte(subSymmetricKey), devPubkey, keyablePrivkey)
var encryptedSub = crypto.EncryptSymmetric([]byte(subJson), []byte(subSymmetricKey))
var subEncryptedByPubkeyId = devId
var subEncryptedByPubkey = devPubkey
var subEncryptedByTrustChain = &crypto.SignedData{
	base64.StdEncoding.EncodeToString(sign.Sign([]byte{}, devTrustChainJson, devSigningPrivkey)),
}

var block1Json = `{"GO_TEST_2":{"val": "works!-block1"},"GO_TEST_3":{"val": "it-block1"},"GO_TEST_4":{"val": "works!-block1"}}`
var block1SymmetricKey = `block1SymmetricKey`
var encryptedBlock1SymmetricKey, _ = crypto.Encrypt([]byte(block1SymmetricKey), pubkey, adminPrivkey)
var encryptedBlock1 = crypto.EncryptSymmetric([]byte(block1Json), []byte(block1SymmetricKey))
var block1EncryptedByPubkeyId = adminId
var block1EncryptedByPubkey = adminPubkey
var block1EncryptedByTrustChain = &crypto.SignedData{
	base64.StdEncoding.EncodeToString(sign.Sign([]byte{}, devTrustChainJson, adminSigningPrivkey)),
}

var block1LocalsJson = `{"GO_TEST_2":{"val": "works!-block1-locals"}, "GO_TEST_4":{"val": "works!-block1-locals"}, "GO_TEST_5":{"val": "works!-block1-locals"}}`
var block1LocalsSymmetricKey = `block1LocalsSymmetricKey`
var encryptedBlock1LocalsSymmetricKey, _ = crypto.Encrypt([]byte(block1LocalsSymmetricKey), pubkey, adminPrivkey)
var encryptedBlock1Locals = crypto.EncryptSymmetric([]byte(block1LocalsJson), []byte(block1LocalsSymmetricKey))
var block1LocalsEncryptedByPubkeyId = adminId
var block1LocalsEncryptedByPubkey = adminPubkey
var block1LocalsEncryptedByTrustChain = &crypto.SignedData{
	base64.StdEncoding.EncodeToString(sign.Sign([]byte{}, devTrustChainJson, adminSigningPrivkey)),
}

var block2Json = `{"GO_TEST_4":{"val": "works!-block2"}}`
var block2SymmetricKey = `block2SymmetricKey`
var block2ForInheritanceJson = `{"GO_TEST_4":{"inheritsEnvironmentId": "block2-environment1"}}`
var block2ForInheritanceSymmetricKey = `block2ForInheritanceSymmetricKey`
var encryptedBlock2SymmetricKey, _ = crypto.Encrypt([]byte(block2SymmetricKey), devPubkey, keyablePrivkey)
var encryptedBlock2 = crypto.EncryptSymmetric([]byte(block2Json), []byte(block2SymmetricKey))
var encryptedBlock2ForInheritanceSymmetricKey, _ = crypto.Encrypt([]byte(block2ForInheritanceSymmetricKey), devPubkey, keyablePrivkey)
var encryptedBlock2ForInheritance = crypto.EncryptSymmetric([]byte(block2ForInheritanceJson), []byte(block2ForInheritanceSymmetricKey))
var block2EncryptedByPubkeyId = devId
var block2EncryptedByPubkey = devPubkey
var block2EncryptedByTrustChain = &crypto.SignedData{
	base64.StdEncoding.EncodeToString(sign.Sign([]byte{}, devTrustChainJson, devSigningPrivkey)),
}

var block2InheritanceJson = `{"GO_TEST_4":{"val": "works!-block2-inherits"}}`
var block2InheritanceSymmetricKey = `block2InheritanceSymmetricKey`
var encryptedBlock2InheritanceSymmetricKey, _ = crypto.Encrypt([]byte(block2InheritanceSymmetricKey), devPubkey, keyablePrivkey)
var encryptedBlock2Inheritance = crypto.EncryptSymmetric([]byte(block2InheritanceJson), []byte(block2InheritanceSymmetricKey))
var block2InheritanceEncryptedByPubkeyId = devId
var block2InheritanceEncryptedByPubkey = devPubkey
var block2InheritanceEncryptedByTrustChain = &crypto.SignedData{
	base64.StdEncoding.EncodeToString(sign.Sign([]byte{}, devTrustChainJson, devSigningPrivkey)),
}

var block2SubJson = `{"GO_TEST_2": {"inheritsEnvironmentId": "block2-environment1"}, "GO_TEST_4": {"val": "works!-block2-subenv"}, "GO_TEST_5": {"val": "works!-block2-subenv"}}`
var block2SubSymmetricKey = `block2SubSymmetricKey`
var encryptedBlock2SubSymmetricKey, _ = crypto.Encrypt([]byte(block2SubSymmetricKey), devPubkey, keyablePrivkey)
var encryptedBlock2Sub = crypto.EncryptSymmetric([]byte(block2SubJson), []byte(block2SubSymmetricKey))
var block2SubEncryptedByPubkeyId = devId
var block2SubEncryptedByPubkey = devPubkey
var block2SubEncryptedByTrustChain = &crypto.SignedData{
	base64.StdEncoding.EncodeToString(sign.Sign([]byte{}, devTrustChainJson, devSigningPrivkey)),
}

var block2SubInheritanceJson = `{"GO_TEST_2":{"val": "works!-block2-inherits"}, "GO_TEST_4":{"val": "works!-block2-inherits"}}`
var block2SubInheritanceSymmetricKey = `block2SubInheritanceSymmetricKey`
var encryptedBlock2SubInheritanceSymmetricKey, _ = crypto.Encrypt([]byte(block2SubInheritanceSymmetricKey), devPubkey, keyablePrivkey)
var encryptedBlock2SubInheritance = crypto.EncryptSymmetric([]byte(block2SubInheritanceJson), []byte(block2SubInheritanceSymmetricKey))
var block2SubInheritanceEncryptedByPubkeyId = devId
var block2SubInheritanceEncryptedByPubkey = devPubkey
var block2SubInheritanceEncryptedByTrustChain = &crypto.SignedData{
	base64.StdEncoding.EncodeToString(sign.Sign([]byte{}, devTrustChainJson, devSigningPrivkey)),
}

var response = parser.FetchResponse{
	KeyableBlob: &parser.KeyableBlob{
		Env: &parser.KeyableBlobFields{
			EncryptedEnv:          encryptedEnv,
			EncryptedKey:          encryptedSymmetricKey,
			EncryptedByPubkeyId:   adminId,
			EncryptedByPubkey:     adminPubkey,
			EncryptedByTrustChain: encryptedByAdminTrustChain,
		},
	},
	EncryptedPrivkey:  encryptedPrivkey,
	Pubkey:            pubkey,
	SignedTrustedRoot: signedTrustedRoot,
}

var responseWithInheritance = parser.FetchResponse{
	KeyableBlob: &parser.KeyableBlob{
		Env: &parser.KeyableBlobFields{
			EncryptedEnv:          encryptedEnvForInheritance,
			EncryptedKey:          encryptedSymmetricKeyForInheritance,
			EncryptedByPubkeyId:   adminId,
			EncryptedByPubkey:     adminPubkey,
			EncryptedByTrustChain: encryptedByAdminTrustChain,
		},
		InheritanceOverrides: parser.InheritanceOverridesBlobs{
			"app1-environment1": parser.KeyableBlobFields{
				EncryptedEnv:          encryptedInheritanceOverrides,
				EncryptedKey:          encryptedInheritanceOverridesSymmetricKey,
				EncryptedByPubkeyId:   devId,
				EncryptedByPubkey:     devPubkey,
				EncryptedByTrustChain: encryptedByDevTrustChain,
			},
		},
	},
	EncryptedPrivkey:  encryptedPrivkey,
	Pubkey:            pubkey,
	SignedTrustedRoot: signedTrustedRoot,
}

var responseWithLocals = parser.FetchResponse{
	KeyableBlob: &parser.KeyableBlob{
		Env: &parser.KeyableBlobFields{
			EncryptedEnv:          encryptedEnv,
			EncryptedKey:          encryptedSymmetricKey,
			EncryptedByPubkeyId:   adminId,
			EncryptedByPubkey:     adminPubkey,
			EncryptedByTrustChain: encryptedByAdminTrustChain,
		},
		Locals: &parser.KeyableBlobFields{
			EncryptedEnv:          encryptedLocals,
			EncryptedKey:          encryptedLocalsSymmetricKey,
			EncryptedByPubkeyId:   localsEncryptedByPubkeyId,
			EncryptedByPubkey:     localsEncryptedByPubkey,
			EncryptedByTrustChain: localsEncryptedByTrustChain,
		},
	},
	EncryptedPrivkey:  encryptedPrivkey,
	Pubkey:            pubkey,
	SignedTrustedRoot: signedTrustedRoot,
}

var responseWithSub = parser.FetchResponse{
	KeyableBlob: &parser.KeyableBlob{
		Env: &parser.KeyableBlobFields{
			EncryptedEnv:          encryptedEnv,
			EncryptedKey:          encryptedSymmetricKey,
			EncryptedByPubkeyId:   adminId,
			EncryptedByPubkey:     adminPubkey,
			EncryptedByTrustChain: encryptedByAdminTrustChain,
		},
		SubEnv: &parser.KeyableBlobFields{
			EncryptedEnv:          encryptedSub,
			EncryptedKey:          encryptedSubSymmetricKey,
			EncryptedByPubkeyId:   subEncryptedByPubkeyId,
			EncryptedByPubkey:     subEncryptedByPubkey,
			EncryptedByTrustChain: subEncryptedByTrustChain,
		},
	},
	EncryptedPrivkey:  encryptedPrivkey,
	Pubkey:            pubkey,
	SignedTrustedRoot: signedTrustedRoot,
}

var responseWithBlocks = parser.FetchResponse{
	KeyableBlob: &parser.KeyableBlob{
		Env: &parser.KeyableBlobFields{
			EncryptedEnv:          encryptedEnv,
			EncryptedKey:          encryptedSymmetricKey,
			EncryptedByPubkeyId:   adminId,
			EncryptedByPubkey:     adminPubkey,
			EncryptedByTrustChain: encryptedByAdminTrustChain,
		},
	},
	EncryptedPrivkey:  encryptedPrivkey,
	Pubkey:            pubkey,
	SignedTrustedRoot: signedTrustedRoot,
	Blocks: []*parser.KeyableBlob{
		{
			Env: &parser.KeyableBlobFields{
				EncryptedEnv:          encryptedBlock1,
				EncryptedKey:          encryptedBlock1SymmetricKey,
				EncryptedByPubkeyId:   block1EncryptedByPubkeyId,
				EncryptedByPubkey:     block1EncryptedByPubkey,
				EncryptedByTrustChain: block1EncryptedByTrustChain,
			},
		},
		{
			Env: &parser.KeyableBlobFields{
				EncryptedEnv:          encryptedBlock2,
				EncryptedKey:          encryptedBlock2SymmetricKey,
				EncryptedByPubkeyId:   block2EncryptedByPubkeyId,
				EncryptedByPubkey:     block2EncryptedByPubkey,
				EncryptedByTrustChain: block2EncryptedByTrustChain,
			},
		},
	},
}

var responseWithInheritanceAndBlocks = parser.FetchResponse{
	KeyableBlob: &parser.KeyableBlob{
		Env: &parser.KeyableBlobFields{
			EncryptedEnv:          encryptedEnvForInheritance,
			EncryptedKey:          encryptedSymmetricKeyForInheritance,
			EncryptedByPubkeyId:   adminId,
			EncryptedByPubkey:     adminPubkey,
			EncryptedByTrustChain: encryptedByAdminTrustChain,
		},
		InheritanceOverrides: parser.InheritanceOverridesBlobs{
			"app1-environment1": parser.KeyableBlobFields{
				EncryptedEnv:          encryptedInheritanceOverrides,
				EncryptedKey:          encryptedInheritanceOverridesSymmetricKey,
				EncryptedByPubkeyId:   devId,
				EncryptedByPubkey:     devPubkey,
				EncryptedByTrustChain: encryptedByDevTrustChain,
			},
		},
	},
	EncryptedPrivkey:  encryptedPrivkey,
	Pubkey:            pubkey,
	SignedTrustedRoot: signedTrustedRoot,
	Blocks: []*parser.KeyableBlob{
		{
			Env: &parser.KeyableBlobFields{
				EncryptedEnv:          encryptedBlock1,
				EncryptedKey:          encryptedBlock1SymmetricKey,
				EncryptedByPubkeyId:   block1EncryptedByPubkeyId,
				EncryptedByPubkey:     block1EncryptedByPubkey,
				EncryptedByTrustChain: block1EncryptedByTrustChain,
			},
		},
		{
			Env: &parser.KeyableBlobFields{
				EncryptedEnv:          encryptedBlock2ForInheritance,
				EncryptedKey:          encryptedBlock2ForInheritanceSymmetricKey,
				EncryptedByPubkeyId:   block2EncryptedByPubkeyId,
				EncryptedByPubkey:     block2EncryptedByPubkey,
				EncryptedByTrustChain: block2EncryptedByTrustChain,
			},
			InheritanceOverrides: parser.InheritanceOverridesBlobs{
				"block2-environment1": parser.KeyableBlobFields{
					EncryptedEnv:          encryptedBlock2Inheritance,
					EncryptedKey:          encryptedBlock2InheritanceSymmetricKey,
					EncryptedByPubkeyId:   block2InheritanceEncryptedByPubkeyId,
					EncryptedByPubkey:     block2InheritanceEncryptedByPubkey,
					EncryptedByTrustChain: block2InheritanceEncryptedByTrustChain,
				},
			},
		},
	},
}

var responseWithLocalsBlocksInheritance = parser.FetchResponse{
	KeyableBlob: &parser.KeyableBlob{
		Env: &parser.KeyableBlobFields{
			EncryptedEnv:          encryptedEnvForInheritance,
			EncryptedKey:          encryptedSymmetricKeyForInheritance,
			EncryptedByPubkeyId:   adminId,
			EncryptedByPubkey:     adminPubkey,
			EncryptedByTrustChain: encryptedByAdminTrustChain,
		},
		InheritanceOverrides: parser.InheritanceOverridesBlobs{
			"app1-environment1": parser.KeyableBlobFields{
				EncryptedEnv:          encryptedInheritanceOverrides,
				EncryptedKey:          encryptedInheritanceOverridesSymmetricKey,
				EncryptedByPubkeyId:   devId,
				EncryptedByPubkey:     devPubkey,
				EncryptedByTrustChain: encryptedByDevTrustChain,
			},
		},
		Locals: &parser.KeyableBlobFields{
			EncryptedEnv:          encryptedLocals,
			EncryptedKey:          encryptedLocalsSymmetricKey,
			EncryptedByPubkeyId:   localsEncryptedByPubkeyId,
			EncryptedByPubkey:     localsEncryptedByPubkey,
			EncryptedByTrustChain: localsEncryptedByTrustChain,
		},
	},
	EncryptedPrivkey:  encryptedPrivkey,
	Pubkey:            pubkey,
	SignedTrustedRoot: signedTrustedRoot,
	Blocks: []*parser.KeyableBlob{
		{
			Env: &parser.KeyableBlobFields{
				EncryptedEnv:          encryptedBlock1,
				EncryptedKey:          encryptedBlock1SymmetricKey,
				EncryptedByPubkeyId:   block1EncryptedByPubkeyId,
				EncryptedByPubkey:     block1EncryptedByPubkey,
				EncryptedByTrustChain: block1EncryptedByTrustChain,
			},
			Locals: &parser.KeyableBlobFields{
				EncryptedEnv:          encryptedBlock1Locals,
				EncryptedKey:          encryptedBlock1LocalsSymmetricKey,
				EncryptedByPubkeyId:   block1LocalsEncryptedByPubkeyId,
				EncryptedByPubkey:     block1LocalsEncryptedByPubkey,
				EncryptedByTrustChain: block1LocalsEncryptedByTrustChain,
			},
		},
		{
			Env: &parser.KeyableBlobFields{
				EncryptedEnv:          encryptedBlock2ForInheritance,
				EncryptedKey:          encryptedBlock2ForInheritanceSymmetricKey,
				EncryptedByPubkeyId:   block2EncryptedByPubkeyId,
				EncryptedByPubkey:     block2EncryptedByPubkey,
				EncryptedByTrustChain: block2EncryptedByTrustChain,
			},
			InheritanceOverrides: parser.InheritanceOverridesBlobs{
				"block2-environment1": parser.KeyableBlobFields{
					EncryptedEnv:          encryptedBlock2Inheritance,
					EncryptedKey:          encryptedBlock2InheritanceSymmetricKey,
					EncryptedByPubkeyId:   block2InheritanceEncryptedByPubkeyId,
					EncryptedByPubkey:     block2InheritanceEncryptedByPubkey,
					EncryptedByTrustChain: block2InheritanceEncryptedByTrustChain,
				},
			},
		},
	},
}

var responseWithSubEnvsBlocksInheritance = parser.FetchResponse{
	KeyableBlob: &parser.KeyableBlob{
		Env: &parser.KeyableBlobFields{
			EncryptedEnv:          encryptedEnvForInheritance,
			EncryptedKey:          encryptedSymmetricKeyForInheritance,
			EncryptedByPubkeyId:   adminId,
			EncryptedByPubkey:     adminPubkey,
			EncryptedByTrustChain: encryptedByAdminTrustChain,
		},
		InheritanceOverrides: parser.InheritanceOverridesBlobs{
			"app1-environment1": parser.KeyableBlobFields{
				EncryptedEnv:          encryptedInheritanceOverrides,
				EncryptedKey:          encryptedInheritanceOverridesSymmetricKey,
				EncryptedByPubkeyId:   devId,
				EncryptedByPubkey:     devPubkey,
				EncryptedByTrustChain: encryptedByDevTrustChain,
			},
		},
		SubEnv: &parser.KeyableBlobFields{
			EncryptedEnv:          encryptedSub,
			EncryptedKey:          encryptedSubSymmetricKey,
			EncryptedByPubkeyId:   subEncryptedByPubkeyId,
			EncryptedByPubkey:     subEncryptedByPubkey,
			EncryptedByTrustChain: subEncryptedByTrustChain,
		},
	},
	EncryptedPrivkey:  encryptedPrivkey,
	Pubkey:            pubkey,
	SignedTrustedRoot: signedTrustedRoot,
	Blocks: []*parser.KeyableBlob{
		{
			Env: &parser.KeyableBlobFields{
				EncryptedEnv:          encryptedBlock1,
				EncryptedKey:          encryptedBlock1SymmetricKey,
				EncryptedByPubkeyId:   block1EncryptedByPubkeyId,
				EncryptedByPubkey:     block1EncryptedByPubkey,
				EncryptedByTrustChain: block1EncryptedByTrustChain,
			},
		},
		{
			Env: &parser.KeyableBlobFields{
				EncryptedEnv:          encryptedBlock2ForInheritance,
				EncryptedKey:          encryptedBlock2ForInheritanceSymmetricKey,
				EncryptedByPubkeyId:   block2EncryptedByPubkeyId,
				EncryptedByPubkey:     block2EncryptedByPubkey,
				EncryptedByTrustChain: block2EncryptedByTrustChain,
			},
			SubEnv: &parser.KeyableBlobFields{
				EncryptedEnv:          encryptedBlock2Sub,
				EncryptedKey:          encryptedBlock2SubSymmetricKey,
				EncryptedByPubkeyId:   block2SubEncryptedByPubkeyId,
				EncryptedByPubkey:     block2SubEncryptedByPubkey,
				EncryptedByTrustChain: block2SubEncryptedByTrustChain,
			},
			InheritanceOverrides: parser.InheritanceOverridesBlobs{
				"block2-environment1": parser.KeyableBlobFields{
					EncryptedEnv:          encryptedBlock2SubInheritance,
					EncryptedKey:          encryptedBlock2SubInheritanceSymmetricKey,
					EncryptedByPubkeyId:   block2SubInheritanceEncryptedByPubkeyId,
					EncryptedByPubkey:     block2SubInheritanceEncryptedByPubkey,
					EncryptedByTrustChain: block2SubInheritanceEncryptedByTrustChain,
				},
			},
		},
	},
}

var responseWithSingleRootPubkeyReplacement = parser.FetchResponse{
	KeyableBlob: &parser.KeyableBlob{
		Env: &parser.KeyableBlobFields{
			EncryptedEnv:          encryptedEnv,
			EncryptedKey:          encryptedSymmetricKey,
			EncryptedByPubkeyId:   adminId,
			EncryptedByPubkey:     adminPubkey,
			EncryptedByTrustChain: encryptedByAdminTrustChain,
		},
	},
	EncryptedPrivkey:  encryptedPrivkey,
	Pubkey:            pubkey,
	SignedTrustedRoot: signedTrustedRoot,
	RootPubkeyReplacements: []*parser.RootPubkeyReplacement{
		{
			Id:                "replacement1",
			ReplacingPubkeyId: adminId,
			ReplacingPubkey:   adminPubkey,
			SignedReplacingTrustChain: &crypto.SignedData{
				base64.StdEncoding.EncodeToString(sign.Sign([]byte{}, replacingTrustChainJson, adminSigningPrivkey)),
			},
		},
	},
}

var responseWithMultiRootPubkeyReplacements = parser.FetchResponse{
	KeyableBlob: &parser.KeyableBlob{
		Env: &parser.KeyableBlobFields{
			EncryptedEnv:          admin2EncryptedEnv,
			EncryptedKey:          admin2EncryptedSymmetricKey,
			EncryptedByPubkeyId:   admin2Id,
			EncryptedByPubkey:     admin2Pubkey,
			EncryptedByTrustChain: encryptedByAdmin2TrustChain,
		},
	},
	EncryptedPrivkey:  encryptedPrivkey,
	Pubkey:            pubkey,
	SignedTrustedRoot: signedTrustedRoot,
	RootPubkeyReplacements: []*parser.RootPubkeyReplacement{
		{
			Id:                "replacement1",
			ReplacingPubkeyId: adminId,
			ReplacingPubkey:   adminPubkey,
			SignedReplacingTrustChain: &crypto.SignedData{
				base64.StdEncoding.EncodeToString(sign.Sign([]byte{}, replacingTrustChainJson, adminSigningPrivkey)),
			},
		},
		{
			Id:                "replacement2",
			ReplacingPubkeyId: admin2Id,
			ReplacingPubkey:   admin2Pubkey,
			SignedReplacingTrustChain: &crypto.SignedData{
				base64.StdEncoding.EncodeToString(sign.Sign([]byte{}, replacing2TrustChainJson, admin2SigningPrivkey)),
			},
		},
	},
}
