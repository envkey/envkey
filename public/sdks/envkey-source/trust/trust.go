package trust

import (
	"errors"

	"github.com/envkey/envkey/public/sdks/envkey-source/crypto"
)

type Signer struct {
	Id     string
	Pubkey *crypto.Pubkey
}

type TrustedKeyable struct {
	Pubkey       *crypto.Pubkey
	InvitePubkey *crypto.Pubkey
	SignerId     string
}

type TrustedKeyablesChain struct {
	TrustedRoot TrustedKeyablesMap
	TrustChain  TrustedKeyablesMap
}

type TrustedKeyablesMap map[string]TrustedKeyable

func (keyable *TrustedKeyable) VerifyInviterOrSigner(signedByKeyable *TrustedKeyable) error {

	// Verify signed key signature
	var err error
	if keyable.InvitePubkey == nil {
		err = crypto.VerifyPubkeySignature(keyable.Pubkey, signedByKeyable.Pubkey)
	} else {
		err = crypto.VerifyPubkeySignature(keyable.InvitePubkey, signedByKeyable.Pubkey)
		if err == nil {
			// If invite, further verify that pubkey was signed by invite key
			return crypto.VerifyPubkeySignature(keyable.Pubkey, keyable.InvitePubkey)
		}
	}

	return err
}

func (trustedKeyables TrustedKeyablesMap) SignerTrustedKeyable(signer *Signer) (*TrustedKeyable, error) {
	if trusted, ok := trustedKeyables[signer.Id]; ok {
		if trusted.Pubkey.Keys.SigningKey == signer.Pubkey.Keys.SigningKey &&
			trusted.Pubkey.Keys.EncryptionKey == signer.Pubkey.Keys.EncryptionKey {
			return &trusted, nil
		} else {
			return nil, errors.New("Signer pubkey does not match trusted pubkey.")
		}
	} else {
		return nil, nil
	}
}

func (trustedKeyables TrustedKeyablesMap) VerifyTrustedRoot(keyable *TrustedKeyable, creatorTrusted TrustedKeyablesMap) error {
	var trustedRoot *TrustedKeyable
	var ok bool
	currentKeyable := keyable
	checked := make(map[string]bool)

	for trustedRoot == nil {
		if (*currentKeyable).SignerId == "" {
			return errors.New("No signing id.")
		}

		if _, ok = checked[(*currentKeyable).SignerId]; ok {
			return errors.New("Already checked signing id: " + (*currentKeyable).SignerId)
		}

		var signedByKeyable TrustedKeyable
		signedByKeyable, ok = creatorTrusted[(*currentKeyable).SignerId]
		if ok {
			trustedRoot = &signedByKeyable
		} else {
			signedByKeyable, ok = trustedKeyables[(*currentKeyable).SignerId]
			if !ok {
				return errors.New("No trusted root." + (*currentKeyable).SignerId)
			}
		}

		err := currentKeyable.VerifyInviterOrSigner(&signedByKeyable)
		if err != nil {
			return err
		}

		// currentKeyable now verified
		checked[(*currentKeyable).SignerId] = true

		if trustedRoot == nil {
			currentKeyable = &signedByKeyable
		}
	}

	if trustedRoot == nil {
		return errors.New("No trusted root.")
	}

	return nil
}

func (trustedKeyables *TrustedKeyablesChain) Verify(signer *Signer) error {
	_, err := trustedKeyables.SignerTrustedKeyable(signer)

	return err
}

func (trustedKeyables *TrustedKeyablesChain) SignerTrustedKeyable(signer *Signer) (*TrustedKeyable, error) {
	var err error
	var trusted *TrustedKeyable

	// First check if key is present in TrustedRoot keys, which means it's trusted, so we can return
	trusted, err = trustedKeyables.TrustedRoot.SignerTrustedKeyable(signer)
	if err != nil {
		return nil, err
	} else if trusted != nil {
		return trusted, nil
	}

	// If env signer, find key in InheritanceOverridesTrustChain (checking only InheritanceOverridesTrustChain keys)
	trusted, err = trustedKeyables.TrustChain.SignerTrustedKeyable(signer)
	if err != nil {
		return nil, err
	} else if trusted == nil {
		return nil, errors.New("Signer not trusted.")
	}

	// Then attempt to validate trust chain back to a TrustedRoot key (checking only TrustChain keys)
	err = trustedKeyables.TrustChain.VerifyTrustedRoot(trusted, trustedKeyables.TrustedRoot)
	if err != nil {
		return nil, err
	}

	return trusted, nil
}
