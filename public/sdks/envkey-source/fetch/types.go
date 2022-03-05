package fetch

import (
	"net/http"

	"github.com/envkey/envkey/public/sdks/envkey-source/crypto"
)

type FetchOptions struct {
	ShouldCache    bool
	CacheDir       string
	ClientName     string
	ClientVersion  string
	VerboseOutput  bool
	TimeoutSeconds float64
	Retries        uint8
	RetryBackoff   float64
}

type FailoverResponse struct {
	SignedUrl string `json:"signedUrl"`
}

type httpChannelResponse struct {
	response *http.Response
	url      string
}

type httpChannelErr struct {
	err error
	url string
}

type actionMetaClient = struct {
	ClientName    string `json:"clientName"`
	ClientVersion string `json:"clientVersion"`
	ClientOs      string `json:"clientOs"`
	ClientArch    string `json:"clientArch"`
}

type actionMeta = struct {
	LoggableType string           `json:"loggableType"`
	Client       actionMetaClient `json:"client"`
}

type updateTrustedRootPayload = struct {
	SignedTrustedRoot *crypto.SignedData `json:"signedTrustedRoot"`
	ReplacementIds    []string           `json:"replacementIds"`
	EnvkeyIdPart      string             `json:"envkeyIdPart"`
	OrgId             string             `json:"orgId"`
	Signature         string             `json:"signature"`
}

type updateTrustedRootAction = struct {
	Type    string                   `json:"type"`
	Meta    actionMeta               `json:"meta"`
	Payload updateTrustedRootPayload `json:"payload"`
}
