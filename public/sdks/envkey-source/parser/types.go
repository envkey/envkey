package parser

import (
	"github.com/envkey/envkey/public/sdks/envkey-source/crypto"
	"github.com/envkey/envkey/public/sdks/envkey-source/trust"
)

type EnvMap map[string]string

type KeyableEnvVal struct {
	Val                   string `json:"val,omitempty"`
	InheritsEnvironmentId string `json:"inheritsEnvironmentId,omitempty"`
	IsUndefined           bool   `json:"isUndefined,omitempty"`
	IsEmpty               bool   `json:"isEmpty,omitempty"`
}

type KeyableEnv map[string]*KeyableEnvVal

type KeyableBlobFields struct {
	EncryptedEnv          *crypto.EncryptedData `json:"encryptedEnv"`
	EncryptedKey          *crypto.EncryptedData `json:"encryptedKey"`
	EncryptedByPubkeyId   string                `json:"encryptedByPubkeyId"`
	EncryptedByPubkey     *crypto.Pubkey        `json:"encryptedByPubkey"`
	EncryptedByTrustChain *crypto.SignedData    `json:"encryptedByTrustChain"`
}

type InheritanceOverrides map[string]KeyableEnv

type InheritanceOverridesBlobs map[string]KeyableBlobFields

type KeyableBlob struct {
	Env                  *KeyableBlobFields        `json:"env,omitempty"`
	SubEnv               *KeyableBlobFields        `json:"subEnv,omitempty"`
	Locals               *KeyableBlobFields        `json:"locals,omitempty"`
	InheritanceOverrides InheritanceOverridesBlobs `json:"inheritanceOverrides,omitempty"`
}

type RootPubkeyReplacement struct {
	Id                        string             `json:"id"`
	ReplacingPubkeyId         string             `json:"replacingPubkeyId"`
	ReplacingPubkey           *crypto.Pubkey     `json:"replacingPubkey"`
	SignedReplacingTrustChain *crypto.SignedData `json:"signedReplacingTrustChain"`
}

type FetchResponse struct {
	*KeyableBlob
	OrgId                  string                   `json:"orgId"`
	EncryptedPrivkey       *crypto.EncryptedData    `json:"encryptedPrivkey"`
	Pubkey                 *crypto.Pubkey           `json:"pubkey"`
	SignedTrustedRoot      *crypto.SignedData       `json:"signedTrustedRoot"`
	Blocks                 []*KeyableBlob           `json:"blocks,omitempty"`
	RootPubkeyReplacements []*RootPubkeyReplacement `json:"rootPubkeyReplacements,omitempty"`
}

type RootKeys struct {
	DecryptedPrivkey *crypto.Privkey
	VerifiedPubkey   *crypto.Pubkey
}

type ResponseWithKeys struct {
	RootKeys
	Response *FetchResponse
}

type KeyableBlobFieldsWithTrustChain struct {
	*KeyableBlobFields
	DecryptedPrivkey     *crypto.Privkey
	TrustedKeyablesChain *trust.TrustedKeyablesChain
	Signer               *trust.Signer
}

type KeyableBlobWithTrustChains struct {
	Env                  *KeyableBlobFieldsWithTrustChain
	SubEnv               *KeyableBlobFieldsWithTrustChain
	Locals               *KeyableBlobFieldsWithTrustChain
	InheritanceOverrides map[string]*KeyableBlobFieldsWithTrustChain
}

type ResponseWithTrustChains struct {
	*KeyableBlobWithTrustChains
	BlocksWithTrustChain []*KeyableBlobWithTrustChains
	ResponseWithKeys     *ResponseWithKeys
}

type DecryptedKeyableBlob struct {
	Env                  KeyableEnv
	SubEnv               KeyableEnv
	Locals               KeyableEnv
	InheritanceOverrides InheritanceOverrides
}

type DecryptedResponse struct {
	*DecryptedKeyableBlob
	DecryptedBlocks []*DecryptedKeyableBlob
}
