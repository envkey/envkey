package trust

import (
	"errors"

	"github.com/envkey/envkey/public/sdks/envkey-source/crypto"

	"golang.org/x/crypto/openpgp"
)

type V1Signer struct {
	Id            string
	PubkeyArmored string
	Pubkey        openpgp.EntityList
}

func V1NewSigner(id, pubkeyArmored string) (*V1Signer, error) {
	pubkey, err := crypto.V1ReadArmoredKey([]byte(pubkeyArmored))
	if err != nil {
		return nil, err
	}
	return &V1Signer{id, pubkeyArmored, pubkey}, nil
}

type V1TrustedKeyable struct {
	PubkeyArmored       string `json:"pubkey"`
	InvitePubkeyArmored string `json:"invitePubkey,omitempty"`
	InvitedById         string `json:"invitedById,omitempty"`
}

func (keyable *V1TrustedKeyable) V1VerifyInviter(inviterKeyable *V1TrustedKeyable) error {
	// Verify signed key signature
	pubkeyArmored := keyable.PubkeyArmored
	invitePubkeyArmored := keyable.InvitePubkeyArmored
	inviterPubkeyArmored := inviterKeyable.PubkeyArmored

	err := crypto.V1VerifyPubkeyArmoredSignature([]byte(invitePubkeyArmored), []byte(inviterPubkeyArmored))
	if err != nil {
		return err
	}

	// If invite, further verify that pubkey was signed by invite key
	return crypto.V1VerifyPubkeyArmoredSignature([]byte(pubkeyArmored), []byte(invitePubkeyArmored))
}

type V1TrustedKeyablesMap map[string]V1TrustedKeyable

func (trustedKeyables V1TrustedKeyablesMap) V1SignerTrustedKeyable(signer *V1Signer) (*V1TrustedKeyable, error) {
	if trusted, ok := trustedKeyables[signer.Id]; ok {
		trustedPubkey, err := crypto.V1ReadArmoredKey([]byte(trusted.PubkeyArmored))
		if err != nil {
			return nil, err
		}

		if trustedPubkey[0].PrimaryKey.Fingerprint == signer.Pubkey[0].PrimaryKey.Fingerprint {
			return &trusted, nil
		} else {
			return nil, errors.New("Signer pubkey fingerprint does not match trusted pubkey fingerprint.")
		}
	} else {
		return nil, nil
	}
}

func (trustedKeyables V1TrustedKeyablesMap) V1TrustedRoot(keyable *V1TrustedKeyable, creatorTrusted V1TrustedKeyablesMap) ([]*V1TrustedKeyable, error) {
	var trustedRoot *V1TrustedKeyable
	var newlyVerified []*V1TrustedKeyable
	var ok bool
	currentKeyable := keyable
	checked := make(map[string]bool)

	for trustedRoot == nil {
		if currentKeyable.InvitedById == "" {
			return nil, errors.New("No signing id.")
		}

		if _, ok = checked[currentKeyable.InvitedById]; ok {
			return nil, errors.New("Already checked signing id: " + currentKeyable.InvitedById)
		}

		var inviterKeyable V1TrustedKeyable
		inviterKeyable, ok = creatorTrusted[currentKeyable.InvitedById]
		if ok {
			trustedRoot = &inviterKeyable
		} else {
			inviterKeyable, ok = trustedKeyables[currentKeyable.InvitedById]
			if !ok {
				return nil, errors.New("No trusted root.")
			}
		}

		err := currentKeyable.V1VerifyInviter(&inviterKeyable)
		if err != nil {
			return nil, err
		}

		// currentKeyable now verified
		checked[currentKeyable.InvitedById] = true
		newlyVerified = append(newlyVerified, currentKeyable)

		if trustedRoot == nil {
			currentKeyable = &inviterKeyable
		}
	}

	if trustedRoot == nil {
		return nil, errors.New("No trusted root.")
	}

	return newlyVerified, nil
}

type V1TrustedKeyablesChain struct {
	CreatorTrusted V1TrustedKeyablesMap
	SignerTrusted  V1TrustedKeyablesMap
}

func (trustedKeyables *V1TrustedKeyablesChain) V1VerifySignerTrusted(signer *V1Signer) error {
	_, _, err := trustedKeyables.V1SignerTrustedKeyable(signer)
	return err
}

func (trustedKeyables *V1TrustedKeyablesChain) V1SignerTrustedKeyable(signer *V1Signer) (*V1TrustedKeyable, []*V1TrustedKeyable, error) {
	var err error
	var trusted *V1TrustedKeyable
	var newlyVerified []*V1TrustedKeyable

	// First check if key is present in CreatorTrusted keys, which means it's trusted, so we can return
	trusted, err = trustedKeyables.CreatorTrusted.V1SignerTrustedKeyable(signer)
	if err != nil {
		return nil, nil, err
	} else if trusted != nil {
		return trusted, []*V1TrustedKeyable{}, nil
	}

	// If env signer, find key in InheritanceOverridesSignerTrusted (checking only InheritanceOverridesSignerTrusted keys)
	trusted, err = trustedKeyables.SignerTrusted.V1SignerTrustedKeyable(signer)
	if err != nil {
		return nil, nil, err
	} else if trusted == nil {
		return nil, nil, errors.New("Signer not trusted.")
	}

	// Then attempt to validate trust chain back to a CreatorTrusted key (checking only SignerTrusted keys)
	newlyVerified, err = trustedKeyables.SignerTrusted.V1TrustedRoot(trusted, trustedKeyables.CreatorTrusted)
	if err != nil {
		return nil, nil, err
	}

	return trusted, newlyVerified, nil
}
