package crypto

import (
	"bytes"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"

	"golang.org/x/crypto/ed25519"
	"golang.org/x/crypto/nacl/box"
	"golang.org/x/crypto/nacl/secretbox"
	"golang.org/x/crypto/nacl/sign"
)

type EncryptionAndSigningKeys struct {
	SigningKey    string `json:"signingKey"`
	EncryptionKey string `json:"encryptionKey"`
}

type Pubkey struct {
	Keys      EncryptionAndSigningKeys `json:"keys"`
	Signature string                   `json:"signature"`
}

type Privkey struct {
	Keys EncryptionAndSigningKeys `json:"keys"`
}

type EncryptedData struct {
	Data  string `json:"data"`
	Nonce string `json:"nonce"`
}

type SignedData struct {
	Data string `json:"data"`
}

type EncryptedKeypair struct {
	Pubkey           Pubkey        `json:"pubkey"`
	EncryptedPrivkey EncryptedData `json:"encryptedPrivkey"`
}

type Keypair struct {
	Pubkey  Pubkey
	Privkey Privkey
}

func Encrypt(msg []byte, pubkey *Pubkey, privkey *Privkey) (*EncryptedData, error) {
	rnd := make([]byte, 24)
	rand.Read(rnd)
	var nonce [24]byte
	copy(nonce[:], rnd)

	privkeyBytes, err := base64.StdEncoding.DecodeString(privkey.Keys.EncryptionKey)
	if err != nil {
		return nil, err
	}

	pubkeyBytes, err := base64.StdEncoding.DecodeString(pubkey.Keys.EncryptionKey)
	if err != nil {
		return nil, err
	}

	var priv, pub [32]byte
	copy(priv[:], privkeyBytes)
	copy(pub[:], pubkeyBytes)

	encryptedBytes := box.Seal([]byte{}, msg, &nonce, &pub, &priv)

	return &EncryptedData{
		Data:  base64.StdEncoding.EncodeToString(encryptedBytes[:]),
		Nonce: base64.StdEncoding.EncodeToString(nonce[:]),
	}, nil
}

func EncryptSymmetric(msg []byte, key []byte) *EncryptedData {
	rnd := make([]byte, 24)
	rand.Read(rnd)
	var nonce [24]byte
	copy(nonce[:], rnd)

	// this function is only used with high entropy random keys, so we just use sha256 here to derive the key instead of a KDF
	symmetricKey := sha256.Sum256(key)

	encryptedBytes := secretbox.Seal([]byte{}, msg, &nonce, &symmetricKey)

	return &EncryptedData{
		Data:  base64.StdEncoding.EncodeToString(encryptedBytes[:]),
		Nonce: base64.StdEncoding.EncodeToString(nonce[:]),
	}
}

func Decrypt(encrypted *EncryptedData, pubkey *Pubkey, privkey *Privkey) ([]byte, error) {
	nonceBytes, err := base64.StdEncoding.DecodeString(encrypted.Nonce)
	if err != nil {
		return []byte{}, err
	}

	var nonce [24]byte
	copy(nonce[:], nonceBytes)

	privkeyBytes, err := base64.StdEncoding.DecodeString(privkey.Keys.EncryptionKey)
	if err != nil {
		return []byte{}, err
	}

	pubkeyBytes, err := base64.StdEncoding.DecodeString(pubkey.Keys.EncryptionKey)
	if err != nil {
		return []byte{}, err
	}

	var priv, pub [32]byte
	copy(priv[:], privkeyBytes)
	copy(pub[:], pubkeyBytes)

	encryptedBytes, err := base64.StdEncoding.DecodeString(encrypted.Data)
	if err != nil {
		return []byte{}, err
	}

	decrypted, ok := box.Open([]byte{}, encryptedBytes, &nonce, &pub, &priv)

	if ok == false {
		return decrypted, errors.New("Decryption failed.")
	}

	return decrypted, nil
}

func DecryptSymmetric(encrypted *EncryptedData, key []byte) ([]byte, error) {
	nonceBytes, err := base64.StdEncoding.DecodeString(encrypted.Nonce)
	if err != nil {
		return []byte{}, err
	}

	var nonce [24]byte
	copy(nonce[:], nonceBytes)

	encryptedBytes, err := base64.StdEncoding.DecodeString(encrypted.Data)
	if err != nil {
		return []byte{}, err
	}

	// this function is only used with high entropy random keys, so we just use sha256 here to derive the key instead of a KDF
	symmetricKey := sha256.Sum256(key)

	decrypted, ok := secretbox.Open([]byte{}, encryptedBytes, &nonce, &symmetricKey)

	if ok == false {
		return decrypted, errors.New("Decryption failed.")
	}

	return decrypted, nil
}

func VerifyDetached(message, sig []byte, pubkey *Pubkey) error {
	signingPubkeyBytes, err := base64.StdEncoding.DecodeString(pubkey.Keys.SigningKey)
	if err != nil {
		return err
	}

	ok := ed25519.Verify(signingPubkeyBytes, message, sig)

	if ok == false {
		return errors.New("Signature or key invalid.")
	}

	return nil
}

func VerifySignedCleartext(signed []byte, pubkey *Pubkey) ([]byte, error) {
	pubkeyBytes, err := base64.StdEncoding.DecodeString(pubkey.Keys.SigningKey)
	if err != nil {
		return []byte{}, err
	}

	var pub [32]byte
	copy(pub[:], pubkeyBytes)

	msg, ok := sign.Open([]byte{}, signed, &pub)

	if ok == false {
		return msg, errors.New("Signature or key invalid.")
	}

	return msg, nil
}

func VerifyPubkeySignature(signedPubkey, signerPubkey *Pubkey) error {
	signedKeysJson, err := json.Marshal(signedPubkey.Keys)
	if err != nil {
		return err
	}

	sig, err := base64.StdEncoding.DecodeString(signedPubkey.Signature)
	if err != nil {
		return err
	}

	return VerifyDetached(signedKeysJson, sig, signerPubkey)
}

func SignJson(obj interface{}, privkey *Privkey) (*SignedData, error) {
	jsonBytes, err := json.Marshal(obj)
	if err != nil {
		return nil, err
	}

	privkeyBytes, err := base64.StdEncoding.DecodeString(privkey.Keys.SigningKey)
	if err != nil {
		return nil, err
	}

	var priv [64]byte
	copy(priv[:], privkeyBytes)

	signedBytes := sign.Sign([]byte{}, jsonBytes, &priv)

	data := base64.StdEncoding.EncodeToString(signedBytes)

	return &SignedData{Data: data}, nil
}

func SignJsonDetached(obj interface{}, privkey *Privkey) (string, error) {
	jsonBytes, err := json.Marshal(obj)
	if err != nil {
		return "", err
	}

	privkeyBytes, err := base64.StdEncoding.DecodeString(privkey.Keys.SigningKey)
	if err != nil {
		return "", err
	}

	sigBytes := ed25519.Sign(privkeyBytes, jsonBytes)

	sig := base64.StdEncoding.EncodeToString(sigBytes)

	return sig, nil
}

func VerifyPubkeyWithPrivkey(pubkey *Pubkey, privkey *Privkey) error {
	// first verify encryption key
	msg := []byte("test message")

	// since senders can decrypt their own messages, we need an ephemeral keypair to act as the sender
	ephemeralPubkeyBytes, ephemeralPrivkeyBytes, err := box.GenerateKey(rand.Reader)
	if err != nil {
		return err
	}
	ephemeralPrivkey := &Privkey{
		Keys: EncryptionAndSigningKeys{
			EncryptionKey: base64.StdEncoding.EncodeToString(ephemeralPrivkeyBytes[:]),
			SigningKey:    "",
		},
	}
	ephemeralPubkey := &Pubkey{
		Keys: EncryptionAndSigningKeys{
			EncryptionKey: base64.StdEncoding.EncodeToString(ephemeralPubkeyBytes[:]),
			SigningKey:    "",
		},
	}

	encrypted, err := Encrypt(msg, pubkey, ephemeralPrivkey)
	if err != nil {
		return err
	}
	decrypted, err := Decrypt(encrypted, ephemeralPubkey, privkey)
	if err != nil {
		return err
	}

	if !bytes.Equal(msg, decrypted) {
		return errors.New("Decrypted message does not match original message.")
	}

	// now verify signing key
	signingPrivkeyBytes, err := base64.StdEncoding.DecodeString(privkey.Keys.SigningKey)
	if err != nil {
		return err
	}

	sig := ed25519.Sign(signingPrivkeyBytes, msg)

	return VerifyDetached(msg, sig, pubkey)
}
