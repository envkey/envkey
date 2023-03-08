package parser

import (
	"encoding/json"
	"errors"

	"github.com/envkey/envkey/public/sdks/envkey-source/crypto"
	"github.com/envkey/envkey/public/sdks/envkey-source/trust"

	"golang.org/x/crypto/openpgp"
)

type V1EnvServiceResponse struct {
	EncryptedV2Key         string `json:"encryptedV2Key"`
	EncryptedPrivkey       string `json:"encryptedPrivkey"`
	PubkeyArmored          string `json:"pubkey"`
	SignedTrustedPubkeys   string `json:"signedTrustedPubkeys"`
	SignedById             string `json:"signedById"`
	SignedByPubkeyArmored  string `json:"signedByPubkey"`
	SignedByTrustedPubkeys string `json:"signedByTrustedPubkeys"`
}

func (response *V1EnvServiceResponse) v1Validate() error {
	valid := response.EncryptedV2Key != "" &&
		response.EncryptedPrivkey != "" &&
		response.PubkeyArmored != "" &&
		response.SignedTrustedPubkeys != "" &&
		response.SignedById != "" &&
		response.SignedByPubkeyArmored != "" &&
		response.SignedByTrustedPubkeys != ""

	if !valid {
		return errors.New("Required fields are empty.")
	}

	return nil
}

func (response *V1EnvServiceResponse) LegacyV1Parse(pw string) (EnvMap, error) {
	var err error
	var responseWithKeys *V1ResponseWithKeys
	var responseWithTrustChain *V1ResponseWithTrustChain

	err = response.v1Validate()
	if err != nil {
		return EnvMap{}, err
	}

	responseWithKeys, err = response.v1ParseKeys(pw)
	if err != nil {
		return EnvMap{}, err
	}

	responseWithTrustChain, err = responseWithKeys.v1ParseTrustChain()
	if err != nil {
		return EnvMap{}, err
	}

	return responseWithTrustChain.v1DecryptAndVerify()
}

func (response *V1EnvServiceResponse) v1ParseKeys(pw string) (*V1ResponseWithKeys, error) {
	var err error
	var decryptedPrivkey, verifiedPubkey, signedByPubkey openpgp.EntityList

	decryptedPrivkey, err = crypto.V1ReadPrivkey([]byte(response.EncryptedPrivkey), []byte(pw))
	if err != nil {
		return nil, err
	}

	verifiedPubkey, err = crypto.V1ReadArmoredKey([]byte(response.PubkeyArmored))
	if err != nil {
		return nil, err
	}

	err = crypto.V1VerifyPubkeyWithPrivkey(verifiedPubkey, decryptedPrivkey)
	if err != nil {
		return nil, err
	}

	signedByPubkey, err = crypto.V1ReadArmoredKey([]byte(response.SignedByPubkeyArmored))
	if err != nil {
		return nil, err
	}

	responseWithKeys := V1ResponseWithKeys{
		RawResponse:      response,
		DecryptedPrivkey: decryptedPrivkey,
		VerifiedPubkey:   verifiedPubkey,
		SignerKeyring:    append(decryptedPrivkey, signedByPubkey...),
		SignedByPubkey:   signedByPubkey,
	}

	return &responseWithKeys, nil
}

type V1ResponseWithKeys struct {
	RawResponse                                                     *V1EnvServiceResponse
	DecryptedPrivkey, VerifiedPubkey, SignerKeyring, SignedByPubkey openpgp.EntityList
}

func (response *V1ResponseWithKeys) signer() *trust.V1Signer {
	return &trust.V1Signer{
		response.RawResponse.SignedById,
		response.RawResponse.SignedByPubkeyArmored,
		response.SignedByPubkey,
	}
}

func (response *V1ResponseWithKeys) trustedKeyablesChain() (*trust.V1TrustedKeyablesChain, error) {
	var err error
	var creatorTrusted, signerTrusted trust.V1TrustedKeyablesMap

	creatorTrusted, err = v1ParseTrustedKeys(response.RawResponse.SignedTrustedPubkeys, response.VerifiedPubkey)
	if err != nil {
		return nil, err
	}

	signerTrusted, err = v1ParseTrustedKeys(response.RawResponse.SignedByTrustedPubkeys, response.SignedByPubkey)
	if err != nil {
		return nil, err
	}

	trustedChain := trust.V1TrustedKeyablesChain{creatorTrusted, signerTrusted}

	return &trustedChain, nil
}

func (response *V1ResponseWithKeys) v1ParseTrustChain() (*V1ResponseWithTrustChain, error) {
	trustedKeyablesChain, err := response.trustedKeyablesChain()
	if err != nil {
		return nil, err
	}

	responseWithTrustChain := V1ResponseWithTrustChain{
		ResponseWithKeys:     response,
		TrustedKeyablesChain: trustedKeyablesChain,
		Signer:               response.signer(),
	}

	return &responseWithTrustChain, nil
}

type V1ResponseWithTrustChain struct {
	ResponseWithKeys     *V1ResponseWithKeys
	TrustedKeyablesChain *trust.V1TrustedKeyablesChain
	Signer               *trust.V1Signer
}

func (response *V1ResponseWithTrustChain) v1VerifyTrusted(signer *trust.V1Signer) error {
	trusted, _, err := response.TrustedKeyablesChain.V1SignerTrustedKeyable(signer)

	if err != nil {
		return err
	} else if trusted == nil {
		return errors.New("Signer not trusted.")
	}

	return nil
}

func (response *V1ResponseWithTrustChain) v1DecryptAndVerify() (EnvMap, error) {
	var err error

	// verify signer trusted
	err = response.v1VerifyTrusted(response.Signer)
	if err != nil {
		return nil, err
	}

	// decrypt env
	var decryptedEnvBytes []byte
	decryptedEnvBytes, err = crypto.V1DecryptAndVerify(
		[]byte(response.ResponseWithKeys.RawResponse.EncryptedV2Key),
		response.ResponseWithKeys.SignerKeyring,
	)
	if err != nil {
		return nil, err
	}

	var env EnvMap
	err = json.Unmarshal(decryptedEnvBytes, &env)
	if err != nil {
		return nil, err
	}

	return env, nil
}

func v1ParseTrustedKeys(rawTrusted string, signerPubkey openpgp.EntityList) (trust.V1TrustedKeyablesMap, error) {
	var err error
	var verified []byte

	trusted := make(trust.V1TrustedKeyablesMap)

	verified, err = crypto.V1VerifySignedCleartext([]byte(rawTrusted), signerPubkey)
	if err != nil {
		return nil, err
	}

	err = json.Unmarshal(verified, &trusted)
	if err != nil {
		return nil, err
	}

	return trusted, nil
}
