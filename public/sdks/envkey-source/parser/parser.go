package parser

import (
	"encoding/base64"
	"encoding/json"
	"errors"
	"sync"

	// "github.com/davecgh/go-spew/spew"
	"github.com/envkey/envkey/public/sdks/envkey-source/crypto"
	"github.com/envkey/envkey/public/sdks/envkey-source/trust"
	"github.com/mitchellh/mapstructure"
)

func (response *FetchResponse) Parse(encryptionKey string) (EnvMap, *crypto.Privkey, *crypto.SignedData, []string, error) {
	var err error
	var responseWithKeys *ResponseWithKeys
	var responseWithTrustChains *ResponseWithTrustChains
	var newSignedTrustedRoot *crypto.SignedData
	var replacementIds []string
	var decrypted *DecryptedResponse

	err = response.validate()
	if err != nil {
		return nil, nil, nil, []string{}, err
	}

	responseWithKeys, err = response.parseKeys(encryptionKey)
	if err != nil {
		return nil, nil, nil, []string{}, err
	}

	responseWithTrustChains, newSignedTrustedRoot, replacementIds, err = responseWithKeys.parseTrustChain()

	if err != nil {
		return nil, nil, nil, []string{}, err
	}

	decrypted, err = responseWithTrustChains.verifyAndDecrypt()

	if err != nil {
		return nil, nil, nil, []string{}, err
	}

	res, err := decrypted.toMap()

	return res, responseWithKeys.DecryptedPrivkey, newSignedTrustedRoot, replacementIds, err
}

func (env EnvMap) ToJson() (string, error) {
	envJson, err := json.Marshal(env)
	if err != nil {
		return "", err
	}
	return string(envJson), nil
}

func (response *FetchResponse) parseKeys(encryptionKey string) (*ResponseWithKeys, error) {
	var decryptedPrivkey crypto.Privkey
	var err error

	decryptedPrivkeyBytes, err := crypto.DecryptSymmetric(response.EncryptedPrivkey, []byte(encryptionKey))
	if err != nil {
		return nil, err
	}

	err = json.Unmarshal(decryptedPrivkeyBytes, &decryptedPrivkey)
	if err != nil {
		return nil, err
	}

	err = crypto.VerifyPubkeyWithPrivkey(response.Pubkey, &decryptedPrivkey)
	if err != nil {
		return nil, err
	}

	responseWithKeys := ResponseWithKeys{
		RootKeys{
			DecryptedPrivkey: &decryptedPrivkey,
			VerifiedPubkey:   response.Pubkey,
		},
		response,
	}

	return &responseWithKeys, nil
}

func (blobFields *KeyableBlobFields) validate() error {
	valid := blobFields.EncryptedByPubkeyId != "" &&
		blobFields.EncryptedByPubkey != nil &&
		blobFields.EncryptedByTrustChain != nil &&
		blobFields.EncryptedEnv != nil

	if valid {
		return nil
	} else {
		return errors.New("Required fields are empty.")
	}
}

func (inheritanceOverridesBlobs *InheritanceOverridesBlobs) validate() error {
	for _, blobFields := range *inheritanceOverridesBlobs {
		err := blobFields.validate()
		if err != nil {
			return err
		}
	}

	return nil
}

func (blob *KeyableBlob) validate() error {
	if blob.Env != nil {
		err := blob.Env.validate()
		if err != nil {
			return err
		}
	}

	if blob.SubEnv != nil {
		err := blob.SubEnv.validate()
		if err != nil {
			return err
		}
	}

	if blob.Locals != nil {
		err := blob.Locals.validate()
		if err != nil {
			return err
		}
	}

	if blob.InheritanceOverrides != nil {
		err := blob.InheritanceOverrides.validate()
		if err != nil {
			return err
		}
	}

	return nil
}

func (response *FetchResponse) validate() error {
	valid := response.SignedTrustedRoot != nil &&
		response.EncryptedPrivkey != nil &&
		response.Pubkey != nil

	if !valid {
		return errors.New("Required fields are empty.")
	}

	if response.KeyableBlob != nil {
		err := response.KeyableBlob.validate()
		if err != nil {
			return err
		}
	}

	return response.validateBlocks()
}

func (response *FetchResponse) validateBlocks() error {
	if len(response.Blocks) == 0 {
		return nil
	}

	var err error
	for _, blob := range response.Blocks {
		err = blob.validate()
		if err != nil {
			return err
		}
	}

	return nil
}

func (blobFields *KeyableBlobFields) signer() *trust.Signer {
	return &trust.Signer{
		Id:     blobFields.EncryptedByPubkeyId,
		Pubkey: blobFields.EncryptedByPubkey,
	}
}

func (replacement *RootPubkeyReplacement) signer() *trust.Signer {
	return &trust.Signer{
		Id:     replacement.ReplacingPubkeyId,
		Pubkey: replacement.ReplacingPubkey,
	}
}

func (responseWithKeys *ResponseWithKeys) parseTrustChain() (*ResponseWithTrustChains, *crypto.SignedData, []string, error) {
	var newSignedTrustedRoot *crypto.SignedData

	trustedRoot, err := parseTrustedKeys(responseWithKeys.Response.SignedTrustedRoot, responseWithKeys.Response.Pubkey)
	if err != nil {
		return nil, nil, []string{}, err
	}

	var replacementIds []string
	trustedRoot, newSignedTrustedRoot, replacementIds, err = parseRootPubkeyReplacements(
		trustedRoot,
		responseWithKeys.Response.RootPubkeyReplacements,
		responseWithKeys.DecryptedPrivkey,
	)
	if err != nil {
		return nil, nil, []string{}, err
	}

	var keyableBlobWithTrustChains *KeyableBlobWithTrustChains
	var blocksWithTrustChain []*KeyableBlobWithTrustChains

	resChan := make(chan error)
	var numQueued uint16
	var numProcessed uint16

	if responseWithKeys.Response.KeyableBlob != nil {
		numQueued++
		go func() {
			keyableBlobWithTrustChains, err = responseWithKeys.Response.KeyableBlob.parseTrustChain(responseWithKeys.DecryptedPrivkey, trustedRoot)
			resChan <- err
		}()
	}

	if len(responseWithKeys.Response.Blocks) > 0 {
		blocksWithTrustChain = make([]*KeyableBlobWithTrustChains, len(responseWithKeys.Response.Blocks))
		lock := sync.RWMutex{}

		for i, block := range responseWithKeys.Response.Blocks {
			numQueued++
			go func(i int, block *KeyableBlob) {
				blockWithTrustChain, err := block.parseTrustChain(responseWithKeys.DecryptedPrivkey, trustedRoot)
				if err == nil {
					lock.Lock()
					blocksWithTrustChain[i] = blockWithTrustChain
					lock.Unlock()
				}
				resChan <- err
			}(i, block)
		}
	}

	if numQueued > 0 {
		for {
			err := <-resChan
			if err == nil {
				numProcessed++
				if numProcessed == numQueued {
					break
				}
			} else {
				return nil, nil, []string{}, err
			}
		}
	}

	responseWithTrustChains := ResponseWithTrustChains{
		KeyableBlobWithTrustChains: keyableBlobWithTrustChains,
		ResponseWithKeys:           responseWithKeys,
		BlocksWithTrustChain:       blocksWithTrustChain,
	}

	return &responseWithTrustChains, newSignedTrustedRoot, replacementIds, nil
}

func (blobFields *KeyableBlobFields) parseTrustChain(decryptedPrivkey *crypto.Privkey, trustedRoot trust.TrustedKeyablesMap) (*KeyableBlobFieldsWithTrustChain, error) {
	trustChain, err := parseTrustedKeys(blobFields.EncryptedByTrustChain, blobFields.EncryptedByPubkey)

	if err != nil {
		return nil, err
	}

	trustedChain := trust.TrustedKeyablesChain{TrustedRoot: trustedRoot, TrustChain: trustChain}

	withTrustChain := KeyableBlobFieldsWithTrustChain{
		KeyableBlobFields:    blobFields,
		DecryptedPrivkey:     decryptedPrivkey,
		TrustedKeyablesChain: &trustedChain,
		Signer:               blobFields.signer(),
	}

	return &withTrustChain, nil
}

func (blob *KeyableBlob) parseTrustChain(decryptedPrivkey *crypto.Privkey, trustedRoot trust.TrustedKeyablesMap) (*KeyableBlobWithTrustChains, error) {
	blobWithTrustChains := KeyableBlobWithTrustChains{}
	lock := sync.RWMutex{}

	resChan := make(chan error)
	var numQueued uint16
	var numProcessed uint16

	if blob.Env != nil {
		numQueued++
		go func() {
			envWithTrustChain, err := blob.Env.parseTrustChain(decryptedPrivkey, trustedRoot)
			lock.Lock()
			blobWithTrustChains.Env = envWithTrustChain
			lock.Unlock()
			resChan <- err
		}()
	}

	if blob.SubEnv != nil {
		numQueued++
		go func() {
			subEnvWithTrustChain, err := blob.SubEnv.parseTrustChain(decryptedPrivkey, trustedRoot)
			lock.Lock()
			blobWithTrustChains.SubEnv = subEnvWithTrustChain
			lock.Unlock()
			resChan <- err
		}()
	}

	if blob.Locals != nil {
		numQueued++
		go func() {
			localsWithTrustChain, err := blob.Locals.parseTrustChain(decryptedPrivkey, trustedRoot)
			lock.Lock()
			blobWithTrustChains.Locals = localsWithTrustChain
			lock.Unlock()
			resChan <- err
		}()
	}

	if len(blob.InheritanceOverrides) != 0 {
		blobWithTrustChains.InheritanceOverrides = map[string]*KeyableBlobFieldsWithTrustChain{}
		for environmentId, blobFields := range blob.InheritanceOverrides {
			numQueued++
			go func(environmentId string, blobFields KeyableBlobFields) {
				blobFieldWithTrustChain, err := blobFields.parseTrustChain(decryptedPrivkey, trustedRoot)

				lock.Lock()
				blobWithTrustChains.InheritanceOverrides[environmentId] = blobFieldWithTrustChain
				lock.Unlock()

				resChan <- err
			}(environmentId, blobFields)
		}
	}

	if numQueued > 0 {
		for {
			err := <-resChan
			if err == nil {
				numProcessed++
				if numProcessed == numQueued {
					break
				}
			} else {
				return nil, err
			}
		}
	}

	return &blobWithTrustChains, nil
}

func (response *ResponseWithTrustChains) verify() error {
	resChan := make(chan error)
	var numQueued uint16
	var numProcessed uint16

	if response.KeyableBlobWithTrustChains != nil {
		numQueued++
		go func() {
			resChan <- response.KeyableBlobWithTrustChains.verify()
		}()
	}

	if len(response.BlocksWithTrustChain) > 0 {

		for _, block := range response.BlocksWithTrustChain {
			numQueued++
			go func(block *KeyableBlobWithTrustChains) {
				resChan <- block.verify()
			}(block)
		}
	}

	if numQueued > 0 {
		for {
			err := <-resChan
			if err == nil {
				numProcessed++
				if numProcessed == numQueued {
					break
				}
			} else {
				return err
			}
		}
	}

	return nil
}

func (blob *KeyableBlobWithTrustChains) verify() error {
	resChan := make(chan error)
	var numQueued uint16
	var numProcessed uint16

	if blob.Env != nil {
		numQueued++
		go func() {
			resChan <- blob.Env.verify()
		}()
	}

	if blob.SubEnv != nil {
		numQueued++
		go func() {
			resChan <- blob.SubEnv.verify()
		}()

	}

	if blob.Locals != nil {
		numQueued++
		go func() {
			resChan <- blob.Locals.verify()
		}()
	}

	if len(blob.InheritanceOverrides) != 0 {
		for _, blobFields := range blob.InheritanceOverrides {
			numQueued++
			go func(blobFields *KeyableBlobFieldsWithTrustChain) {
				resChan <- blobFields.verify()
			}(blobFields)
		}
	}

	if numQueued > 0 {
		for {
			err := <-resChan
			if err == nil {
				numProcessed++
				if numProcessed == numQueued {
					break
				}
			} else {
				return err
			}
		}
	}

	return nil
}

func (blobFields *KeyableBlobFieldsWithTrustChain) verify() error {
	err := blobFields.TrustedKeyablesChain.Verify(blobFields.Signer)
	return err
}

func (blob *KeyableBlobWithTrustChains) decrypt() (*DecryptedKeyableBlob, error) {
	decryptedKeyableBlob := new(DecryptedKeyableBlob)
	lock := sync.RWMutex{}

	resChan := make(chan error)
	var numQueued uint16
	var numProcessed uint16

	if blob.Env != nil {
		numQueued++
		go func() {
			decryptedKey, err := crypto.Decrypt(
				blob.Env.EncryptedKey,
				blob.Env.Signer.Pubkey,
				blob.Env.DecryptedPrivkey,
			)

			decrypted, err := crypto.DecryptSymmetric(blob.Env.EncryptedEnv, decryptedKey)

			if err == nil {
				lock.Lock()
				err = json.Unmarshal(decrypted, &decryptedKeyableBlob.Env)
				lock.Unlock()
			}

			resChan <- err
		}()
	}

	if blob.SubEnv != nil {
		numQueued++
		go func() {
			decryptedKey, err := crypto.Decrypt(
				blob.SubEnv.EncryptedKey,
				blob.SubEnv.Signer.Pubkey,
				blob.SubEnv.DecryptedPrivkey,
			)

			decrypted, err := crypto.DecryptSymmetric(blob.SubEnv.EncryptedEnv, decryptedKey)

			if err == nil {
				lock.Lock()
				err = json.Unmarshal(decrypted, &decryptedKeyableBlob.SubEnv)
				lock.Unlock()
			}

			resChan <- err
		}()
	}

	if blob.Locals != nil {
		numQueued++
		go func() {
			decryptedKey, err := crypto.Decrypt(
				blob.Locals.EncryptedKey,
				blob.Locals.Signer.Pubkey,
				blob.Locals.DecryptedPrivkey,
			)

			decrypted, err := crypto.DecryptSymmetric(blob.Locals.EncryptedEnv, decryptedKey)

			if err == nil {
				lock.Lock()
				err = json.Unmarshal(decrypted, &decryptedKeyableBlob.Locals)
				lock.Unlock()
			}

			resChan <- err
		}()
	}

	if len(blob.InheritanceOverrides) > 0 {
		decryptedKeyableBlob.InheritanceOverrides = InheritanceOverrides{}

		for inheritsEnvironmentId, blobFields := range blob.InheritanceOverrides {
			numQueued++
			go func(inheritsEnvironmentId string, blobFields *KeyableBlobFieldsWithTrustChain) {
				decryptedKey, err := crypto.Decrypt(
					blobFields.EncryptedKey,
					blobFields.Signer.Pubkey,
					blobFields.DecryptedPrivkey,
				)

				decrypted, err := crypto.DecryptSymmetric(blobFields.EncryptedEnv, decryptedKey)

				var overrides KeyableEnv

				if err == nil {
					err := json.Unmarshal(decrypted, &overrides)
					if err == nil {
						lock.Lock()
						decryptedKeyableBlob.InheritanceOverrides[inheritsEnvironmentId] = overrides
						lock.Unlock()
					}

					resChan <- err
				} else {
					resChan <- err
				}
			}(inheritsEnvironmentId, blobFields)
		}
	}

	if numQueued > 0 {
		for {
			err := <-resChan
			if err == nil {
				numProcessed++
				if numProcessed == numQueued {
					break
				}
			} else {
				return nil, err
			}
		}
	}

	return decryptedKeyableBlob, nil
}

func (response *ResponseWithTrustChains) decrypt() (*DecryptedResponse, error) {
	decryptedResponse := new(DecryptedResponse)
	lock := sync.RWMutex{}

	resChan := make(chan error)
	var numQueued uint16
	var numProcessed uint16

	if response.KeyableBlobWithTrustChains != nil {
		numQueued++
		go func() {
			decryptedKeyableBlob, err := response.KeyableBlobWithTrustChains.decrypt()
			lock.Lock()
			decryptedResponse.DecryptedKeyableBlob = decryptedKeyableBlob
			lock.Unlock()
			resChan <- err
		}()
	}

	if len(response.BlocksWithTrustChain) > 0 {
		decryptedResponse.DecryptedBlocks = make([]*DecryptedKeyableBlob, len(response.BlocksWithTrustChain))
		for i, block := range response.BlocksWithTrustChain {
			numQueued++
			go func(i int, block *KeyableBlobWithTrustChains) {
				decryptedKeyableBlob, err := block.decrypt()

				if err == nil {
					lock.Lock()
					decryptedResponse.DecryptedBlocks[i] = decryptedKeyableBlob
					lock.Unlock()
				}

				resChan <- err
			}(i, block)
		}
	}

	if numQueued > 0 {
		for {
			err := <-resChan
			if err == nil {
				numProcessed++
				if numProcessed == numQueued {
					break
				}
			} else {
				return nil, err
			}
		}
	}

	return decryptedResponse, nil
}

func (response *ResponseWithTrustChains) verifyAndDecrypt() (*DecryptedResponse, error) {
	verifyErr := response.verify()
	if verifyErr != nil {
		return nil, verifyErr
	}

	return response.decrypt()
}

func (response *DecryptedResponse) toMap() (EnvMap, error) {
	env := make(EnvMap)
	localsOrSubEnvs := make(KeyableEnv) // either subenv or locals

	if len(response.DecryptedBlocks) > 0 {
		for _, decryptedKeyableBlob := range response.DecryptedBlocks {
			blockEnv, blockLocalsOrSubEnv, err := decryptedKeyableBlob.toKeyableEnvs()

			if err != nil {
				return nil, err
			}
			for k, v := range blockEnv {
				env.setVal(k, v)
			}
			for k, v := range blockLocalsOrSubEnv {
				localsOrSubEnvs[k] = v
			}

		}
	}

	if response.DecryptedKeyableBlob != nil {
		keyableEnv, keyableLocalsOrSubEnv, err := response.DecryptedKeyableBlob.toKeyableEnvs()
		if err != nil {
			return nil, err
		}

		for k, v := range keyableEnv {
			env.setVal(k, v)
		}
		for k, v := range keyableLocalsOrSubEnv {
			localsOrSubEnvs[k] = v
		}
	}

	for k, v := range localsOrSubEnvs {
		env.setVal(k, v)
	}

	return env, nil
}

func (blob *DecryptedKeyableBlob) toKeyableEnvs() (KeyableEnv, KeyableEnv, error) {
	env := make(KeyableEnv)
	localsOrSubEnv := make(KeyableEnv) // either subenv or locals

	if blob.Env != nil {
		for k, v := range blob.Env {
			if v.InheritsEnvironmentId != "" {
				inheritedVal := v
				for inheritedVal != nil && inheritedVal.InheritsEnvironmentId != "" {
					inheritedEnv := blob.InheritanceOverrides[inheritedVal.InheritsEnvironmentId]
					if inheritedEnv == nil {
						inheritedVal = nil
					} else {
						inheritedVal = inheritedEnv[k]
					}

				}
				if inheritedVal != nil {
					env[k] = inheritedVal
				}

			} else {
				env[k] = v
			}
		}
	}

	if blob.SubEnv != nil {
		for k, v := range blob.SubEnv {
			if v.InheritsEnvironmentId != "" {
				inheritedVal := v
				for inheritedVal != nil && inheritedVal.InheritsEnvironmentId != "" {
					inheritedEnv := blob.InheritanceOverrides[inheritedVal.InheritsEnvironmentId]
					if inheritedEnv == nil {
						inheritedVal = nil
					} else {
						inheritedVal = inheritedEnv[k]
					}
				}
				if inheritedVal != nil {
					localsOrSubEnv[k] = inheritedVal
				}

			} else {
				localsOrSubEnv[k] = v
			}
		}
	}

	if blob.Locals != nil {
		for k, v := range blob.Locals {
			if v != nil {
				localsOrSubEnv[k] = v
			}
		}
	}

	return env, localsOrSubEnv, nil
}

func parseTrustedKeys(rawTrusted *crypto.SignedData, signerPubkey *crypto.Pubkey) (trust.TrustedKeyablesMap, error) {
	var err error
	var verified []byte

	var trustedJson map[string][]interface{}
	trustedMap := make(trust.TrustedKeyablesMap)
	rawTrustedBytes, err := base64.StdEncoding.DecodeString(rawTrusted.Data)
	if err != nil {
		return nil, err
	}

	verified, err = crypto.VerifySignedCleartext(rawTrustedBytes, signerPubkey)
	if err != nil {
		return nil, err
	}

	err = json.Unmarshal(verified, &trustedJson)
	if err != nil {
		return nil, err
	}

	for id, jsonArray := range trustedJson {
		trustedKeyable := trust.TrustedKeyable{}
		l := len(jsonArray)

		if l < 2 || l > 4 {
			return make(trust.TrustedKeyablesMap), errors.New("trustedKeyable json array must have 2-4 elements")
		}

		var pubkey crypto.Pubkey
		mapstructure.Decode(jsonArray[1], &pubkey)
		trustedKeyable.Pubkey = &pubkey

		if l == 3 {
			trustedKeyable.SignerId = jsonArray[2].(string)
		} else if l == 4 {
			var invitePubkey crypto.Pubkey
			mapstructure.Decode(jsonArray[2], &invitePubkey)
			trustedKeyable.InvitePubkey = &invitePubkey
			trustedKeyable.SignerId = jsonArray[3].(string)
		}

		trustedMap[id] = trustedKeyable
	}

	return trustedMap, nil
}

func parseRootPubkeyReplacements(trustedRoot trust.TrustedKeyablesMap, replacements []*RootPubkeyReplacement, privkey *crypto.Privkey) (trust.TrustedKeyablesMap, *crypto.SignedData, []string, error) {

	if len(replacements) == 0 {
		return trustedRoot, nil, []string{}, nil
	}

	newTrustedRootMap := trustedRoot
	replacementIds := []string{}
	var newRootPubkey *crypto.Pubkey
	var newRootPubkeyId string

	for _, replacement := range replacements {

		trustChain, err := parseTrustedKeys(replacement.SignedReplacingTrustChain, replacement.ReplacingPubkey)

		if err != nil {
			return nil, nil, []string{}, err
		}

		trustedChain := trust.TrustedKeyablesChain{TrustedRoot: newTrustedRootMap, TrustChain: trustChain}

		signer := replacement.signer()
		err = trustedChain.Verify(signer)

		if err != nil {
			return nil, nil, []string{}, err
		}

		newTrustedRootMap = make(trust.TrustedKeyablesMap)
		newTrustedRootMap[replacement.ReplacingPubkeyId] = trust.TrustedKeyable{replacement.ReplacingPubkey, nil, ""}

		newRootPubkey = replacement.ReplacingPubkey
		newRootPubkeyId = replacement.ReplacingPubkeyId
		replacementIds = append(replacementIds, replacement.Id)
	}

	toSignTrusted := map[string][]interface{}{}
	toSignTrusted[newRootPubkeyId] = []interface{}{"root", newRootPubkey}

	signed, err := crypto.SignJson(toSignTrusted, privkey)

	if err != nil {
		return nil, nil, []string{}, err
	}

	return newTrustedRootMap, signed, replacementIds, nil
}

func (env EnvMap) setVal(k string, envVal *KeyableEnvVal) {
	if envVal.IsUndefined {
		delete(env, k)
	} else if envVal.IsEmpty {
		env[k] = ""
	} else {
		env[k] = envVal.Val
	}
}
