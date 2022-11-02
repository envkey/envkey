package fetch

// this package is tested from outside via end-to-end typescript tests

import (
	"bytes"
	"context"
	"crypto/tls"
	"encoding/json"
	"errors"
	"fmt"
	"io/ioutil"
	"math"
	"net"
	"net/http"
	"net/url"
	"os"
	"regexp"
	"runtime"
	"strconv"
	"strings"
	"time"

	"github.com/certifi/gocertifi"
	"github.com/envkey/envkey/public/sdks/envkey-source/cache"
	"github.com/envkey/envkey/public/sdks/envkey-source/crypto"
	"github.com/envkey/envkey/public/sdks/envkey-source/parser"
	"github.com/envkey/envkey/public/sdks/envkey-source/version"
	multierror "github.com/hashicorp/go-multierror"
	// "github.com/davecgh/go-spew/spew"
)

var DefaultHost = "api-v2.envkey.com"
var Client *http.Client
var FetchServiceVersion = 2
var NumFailovers = 2
var DefaultClientName = "fetch"

var UpdateTrustedRootActionType = "envkey/api/ENVKEY_FETCH_UPDATE_TRUSTED_ROOT_PUBKEY"
var UpdateTrustedRootLoggableType = "authAction"

func Fetch(envkey string, options FetchOptions) (string, error) {
	envMap, err := FetchMap(envkey, options)
	if err != nil {
		return "", err
	}
	return envMap.ToJson()
}

func FetchMap(envkey string, options FetchOptions) (parser.EnvMap, error) {
	if len(strings.Split(envkey, "-")) < 2 {
		return nil, errors.New("ENVKEY invalid")
	}

	// may be initalized already when mocking for tests
	if Client == nil {
		InitClient(options.TimeoutSeconds)
	}

	var fetchCache *cache.Cache
	var cacheErr error

	if options.ShouldCache {
		if options.VerboseOutput {
			var cachePath string
			if options.CacheDir == "" {
				cachePath, _ = cache.DefaultPath()
			} else {
				cachePath = options.CacheDir
			}
			fmt.Fprintf(os.Stderr, "Initializing cache at %s\n", cachePath)
		}

		// If initializing cache fails for some reason, ignore and let it be nil
		fetchCache, cacheErr = cache.NewCache(options.CacheDir)

		if options.VerboseOutput && cacheErr != nil {
			fmt.Fprintf(os.Stderr, "Error initializing cache: %s\n", cacheErr.Error())
		}
	}

	response, envkeyIdPart, envkeyHost, pw, err := fetchEnv(envkey, options, fetchCache)
	if err != nil {
		return nil, err
	}

	if options.VerboseOutput {
		fmt.Fprintln(os.Stderr, "Parsing and decrypting response...")
	}
	res, privkey, newSignedTrustedRoot, replacementIds, err := response.Parse(pw)
	if err != nil {
		if options.VerboseOutput {
			fmt.Fprintln(os.Stderr, "Error parsing and decrypting:")
			fmt.Fprintln(os.Stderr, err)
		}

		if fetchCache != nil {
			// Wait for cache write to finish, then delete cache due to error, then wait for that to finish before returning error
			<-fetchCache.Done
			fetchCache.Delete(envkeyIdPart)
			<-fetchCache.Done
		}

		return nil, errors.New("ENVKEY invalid")
	}

	// If the trusted root pubkey was replaced, send update action back to server, ignoring failure
	if newSignedTrustedRoot != nil && len(replacementIds) > 0 {
		if options.VerboseOutput {
			fmt.Fprintf(os.Stderr, "Processed %d root pubkey replacements. Posting new signed trusted root action back to api server...\n", len(replacementIds))
		}

		err = postUpdateRootPubkeyAction(
			envkeyHost,
			envkeyIdPart,
			response.OrgId,
			privkey,
			newSignedTrustedRoot,
			replacementIds,
			options,
		)

		if options.VerboseOutput {
			if err == nil {
				fmt.Fprintln(os.Stderr, "Error posting new signed trusted root:")
				fmt.Fprintln(os.Stderr, err)
				fmt.Fprintln(os.Stderr, "Ignoring error and continuing.")
			} else {
				fmt.Fprintln(os.Stderr, "Successfully posted new signed trusted root.")
			}
		}
	}

	// Ensure cache bizness finished (don't worry about error)
	if fetchCache != nil {
		select {
		case <-fetchCache.Done:
		default:
		}
	}

	return res, nil
}

func UrlWithLoggingParams(baseUrl string, options FetchOptions) string {
	clientName := options.ClientName
	if clientName == "" {
		clientName = DefaultClientName
	}

	clientVersion := options.ClientVersion
	if clientVersion == "" {
		clientVersion = version.Version
	}

	var querySep string
	if strings.Contains(baseUrl, "?") {
		querySep = "&"
	} else {
		querySep = "?"
	}

	fmtStr := "%s%sclientName=%s&clientVersion=%s&clientOs=%s&clientArch=%s"
	return fmt.Sprintf(
		fmtStr,
		baseUrl,
		querySep,
		url.QueryEscape(clientName),
		url.QueryEscape(clientVersion),
		url.QueryEscape(runtime.GOOS),
		url.QueryEscape(runtime.GOARCH),
	)
}

func InitClient(timeoutSeconds float64) {
	to := time.Second * time.Duration(timeoutSeconds)
	Client = &http.Client{
		Timeout: to,
		Transport: &http.Transport{
			Proxy: http.ProxyFromEnvironment,
			Dial: (&net.Dialer{
				Timeout: time.Duration(timeoutSeconds) * time.Second,
			}).Dial,
			TLSHandshakeTimeout: time.Duration(timeoutSeconds) * time.Second,
		},
	}
}

func replaceCertPool() error {
	certPool, err := gocertifi.CACerts()
	if err != nil {
		return err
	}
	Client.Transport.(*http.Transport).TLSClientConfig = &tls.Config{RootCAs: certPool}
	return nil
}

func httpExecGetRequest(
	req *http.Request,
	respChan chan httpChannelResponse,
	errChan chan httpChannelErr,
) {
	resp, err := Client.Do(req)
	if err == nil {
		respChan <- httpChannelResponse{resp, req.URL.String()}
	} else {
		// if error caused by missing root certificates, pull in gocertifi certs (which come from Mozilla) and try again with those
		if strings.Contains(err.Error(), "x509: failed to load system roots") {
			certPoolErr := replaceCertPool()
			if certPoolErr != nil {
				errChan <- httpChannelErr{multierror.Append(err, certPoolErr), req.URL.String()}
				return
			}
			httpExecGetRequest(req, respChan, errChan)
		} else {
			errChan <- httpChannelErr{err, req.URL.String()}
		}
	}
}

func httpPost(
	url string,
	body []byte,
) (*http.Response, error) {
	req, err := http.NewRequest("POST", url, bytes.NewBuffer(body))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	return Client.Do(req)
}

func httpGetAsync(
	url string,
	ctx context.Context,
	respChan chan httpChannelResponse,
	errChan chan httpChannelErr,
	inRegionFailoverHeader bool,
) {
	req, err := http.NewRequest("GET", url, nil)

	if err != nil {
		errChan <- httpChannelErr{err, url}
		return
	}

	if inRegionFailoverHeader {
		req.Header.Set("Failover", "in-region")
	}

	req = req.WithContext(ctx)

	go httpExecGetRequest(req, respChan, errChan)
}

func httpGet(url string, inRegionFailoverHeader bool) (*http.Response, error) {
	respChan, errChan := make(chan httpChannelResponse), make(chan httpChannelErr)

	httpGetAsync(url, context.Background(), respChan, errChan, inRegionFailoverHeader)

	for {
		select {
		case channelResp := <-respChan:
			return channelResp.response, nil
		case channelErr := <-errChan:
			return nil, channelErr.err
		}
	}
}

func postUpdateRootPubkeyAction(
	envkeyHost string,
	envkeyIdPart string,
	orgId string,
	privkey *crypto.Privkey,
	newSignedTrustedRoot *crypto.SignedData,
	replacementIds []string,
	options FetchOptions,
) error {
	toSign := []interface{}{
		envkeyIdPart,
		orgId,
		replacementIds,
		newSignedTrustedRoot,
	}

	sig, err := crypto.SignJsonDetached(toSign, privkey)
	if err != nil {
		return err
	}

	clientName := options.ClientName
	if clientName == "" {
		clientName = DefaultClientName
	}

	clientVersion := options.ClientVersion
	if clientVersion == "" {
		clientVersion = version.Version
	}

	action := updateTrustedRootAction{
		Type: UpdateTrustedRootActionType,
		Meta: actionMeta{
			LoggableType: UpdateTrustedRootLoggableType,
			Client: actionMetaClient{
				ClientName:    clientName,
				ClientVersion: clientVersion,
				ClientOs:      runtime.GOOS,
				ClientArch:    runtime.GOARCH,
			},
		},
		Payload: updateTrustedRootPayload{
			SignedTrustedRoot: newSignedTrustedRoot,
			ReplacementIds:    replacementIds,
			EnvkeyIdPart:      envkeyIdPart,
			OrgId:             orgId,
			Signature:         sig,
		},
	}

	actionJsonBytes, err := json.Marshal(action)

	if err != nil {
		return err
	}

	resp, err := httpPost(getActionUrl(envkeyHost), actionJsonBytes)
	if err != nil {
		return err
	}

	resp.Body.Close()

	return nil
}

func logRequestIfVerbose(url string, options FetchOptions, err error, r *http.Response) {
	if options.VerboseOutput {
		if err != nil {
			fmt.Fprintf(os.Stderr, "Loading from %s failed.\n", url)
			fmt.Fprintln(os.Stderr, "Error:")
			fmt.Fprintln(os.Stderr, err)
		} else if r.StatusCode >= 500 {
			fmt.Fprintf(os.Stderr, "Loading from %s failed.\n", url)
			fmt.Fprintf(os.Stderr, "Response status: %s\n", strconv.Itoa(r.StatusCode))
		} else {
			fmt.Fprintf(os.Stderr, "Loaded from %s successfully.\n", url)
		}
	}
}

func fetchEnv(envkey string, options FetchOptions, fetchCache *cache.Cache) (*parser.FetchResponse, string, string, string, error) {
	envkeyIdPart, pw, envkeyHost := SplitEnvkey(envkey)
	response := new(parser.FetchResponse)
	err := getJson(envkeyHost, envkeyIdPart, options, response, fetchCache)

	if err != nil && options.Retries > 0 {

		var retry uint8 = 0
		for retry < options.Retries {
			if err.Error() == "ENVKEY invalid" {
				break
			}

			if options.RetryBackoff > 0 {
				var backoff float64 = 0
				backoff = options.RetryBackoff * math.Pow(2, (float64(retry-1)))
				if backoff > 0 {
					time.Sleep(time.Duration(backoff) * time.Second)
				}
			}

			if options.VerboseOutput {
				fmt.Fprintf(os.Stderr, "\nRetrying...\n")
			}
			err = getJson(envkeyHost, envkeyIdPart, options, response, fetchCache)
			if err == nil {
				break
			}

			retry++
		}

	}

	return response, envkeyIdPart, envkeyHost, pw, err
}

func SplitEnvkey(envkey string) (string, string, string) {
	split := strings.Split(envkey, "-")
	var envkeyIdPart, pw, envkeyHost string
	if len(split) > 2 {
		envkeyIdPart, pw, envkeyHost = split[0], split[1], strings.Join(split[2:], "-")
	} else {
		envkeyIdPart, pw = split[0], split[1]
		envkeyHost = ""
	}

	return envkeyIdPart, pw, envkeyHost
}

func GetHost(envkeyHost string) string {
	var host string
	if envkeyHost == "" {
		host = DefaultHost
	} else {
		host = envkeyHost
	}

	return "https://" + host
}

func getActionUrl(envkeyHost string) string {
	host := GetHost(envkeyHost)

	return host + "/action"
}

func getFetchUrlBase(envkeyHost string, envkeyIdPart string, numEndpoint int) string {
	host := GetHost(envkeyHost)

	if numEndpoint > 1 {
		re := regexp.MustCompile(`(.+?)\.(.+)`)
		host = re.ReplaceAllString(host, ("$1-" + strconv.Itoa(numEndpoint) + ".$2"))
	}

	return host + "/fetch?fetchServiceVersion=" + strconv.Itoa(FetchServiceVersion) + "&envkeyIdPart=" + envkeyIdPart
}

func getJsonUrl(envkeyHost string, envkeyIdPart string, options FetchOptions, numEndpoint int) string {
	baseUrl := getFetchUrlBase(envkeyHost, envkeyIdPart, numEndpoint)
	return UrlWithLoggingParams(baseUrl, options)
}

func getJson(envkeyHost string, envkeyIdPart string, options FetchOptions, response *parser.FetchResponse, fetchCache *cache.Cache) error {

	numEndpoint := 0
	maxEndpoints := NumFailovers

	var body []byte
	var err error
	var r *http.Response

	for numEndpoint <= maxEndpoints {
		body, r, err = getJsonBody(envkeyHost, envkeyIdPart, options, numEndpoint)

		if err == nil && r.StatusCode == 200 {
			break
		}

		if r != nil && r.StatusCode == 404 {
			if options.VerboseOutput {
				fmt.Fprintln(os.Stderr, "Fetch error.")
				fmt.Fprintln(os.Stderr, "404 not found")
			}

			// Since ENVKEY wasn't found and permission may have been removed, clear cache
			if fetchCache != nil {
				fetchCache.Delete(envkeyIdPart)
			}
			return errors.New("ENVKEY invalid")
		} else if r != nil && r.StatusCode == 426 {
			return errors.New("organization requires a newer version of envkey-source client")
		} else if r != nil && r.StatusCode == 429 {
			return errors.New("request limit exceeded")
		}

		numEndpoint = numEndpoint + 1
	}

	// if we fetched from a failover, that will give us a pre-signed s3 url that we then
	// need to load the actual payload from before proceeding
	if err == nil && numEndpoint > 0 {
		failoverResponse := new(FailoverResponse)
		err = json.Unmarshal(body, &failoverResponse)

		if err == nil {
			body, r, err = getFailoverJsonBody(failoverResponse.SignedUrl, options)

			if err != nil || r.StatusCode >= 400 {
				msg := "Error fetching pre-signed s3 failover url (" + failoverResponse.SignedUrl + "): "
				if err == nil {
					msg = msg + "\nresponse status: " + strconv.Itoa(r.StatusCode)
				} else {
					msg = msg + "\nfetch error: " + err.Error()
				}

				if options.VerboseOutput {
					fmt.Fprintln(os.Stderr, msg)
				}
				err = errors.New(msg)
			}
		} else {
			msg := "Error parsing failover response: " + err.Error()
			if options.VerboseOutput {
				fmt.Fprintln(os.Stderr, msg)
			}
			err = errors.New(msg)
		}
	}

	// Handle error scenarios where main url and all fallbacks have failed
	if err != nil || r == nil || r.StatusCode >= 400 {
		var msg string

		if err == nil {
			msg = "could not load from server.\nresponse status: " + strconv.Itoa(r.StatusCode)
		} else {
			msg = "could not load from server.\nfetch error: " + err.Error()
		}

		// try loading from cache
		if fetchCache != nil {
			body, err = fetchCache.Read(envkeyIdPart)
			if err != nil {
				if options.VerboseOutput {
					fmt.Fprintln(os.Stderr, "Cache read error:")
					fmt.Fprintln(os.Stderr, err)
				}
				msg = msg + "\ncache read error: " + err.Error()
			}
		}

		if err != nil {
			err = errors.New(msg)
		}
	}

	if err == nil {
		err = json.Unmarshal(body, response)
		if fetchCache != nil && err == nil {
			// If caching enabled, write raw response to cache while doing decryption in parallel
			go fetchCache.Write(envkeyIdPart, body)
		}
	}

	return err
}

func getJsonBody(envkeyHost string, envkeyIdPart string, options FetchOptions, numEndpoint int) ([]byte, *http.Response, error) {
	var err, fetchErr error
	var body []byte
	var r *http.Response

	url := getJsonUrl(envkeyHost, envkeyIdPart, options, numEndpoint)

	if options.VerboseOutput {
		fmt.Fprintf(os.Stderr, "Attempting to load encrypted config from url: %s\n", url)
	}

	r, fetchErr = httpGet(url, numEndpoint == 1)
	if r != nil {
		defer r.Body.Close()
	}

	if fetchErr == nil && r.StatusCode == 200 {
		body, err = ioutil.ReadAll(r.Body)

		if err != nil {
			if options.VerboseOutput {
				fmt.Fprintln(os.Stderr, "Error reading response body:")
				fmt.Fprintln(os.Stderr, err)
			}
		}
	} else if fetchErr != nil {
		err = fetchErr
	}

	return body, r, err
}

func getFailoverJsonBody(signedUrl string, options FetchOptions) ([]byte, *http.Response, error) {
	var err, fetchErr error
	var body []byte
	var r *http.Response

	if options.VerboseOutput {
		fmt.Fprintf(os.Stderr, "Attempting to load encrypted config from pre-signed s3 failover url: %s\n", signedUrl)
	}

	r, fetchErr = httpGet(signedUrl, false)
	if r != nil {
		defer r.Body.Close()
	}

	if fetchErr == nil && r.StatusCode == 200 {
		body, err = ioutil.ReadAll(r.Body)

		if err != nil {
			if options.VerboseOutput {
				fmt.Fprintln(os.Stderr, "Error reading response body:")
				fmt.Fprintln(os.Stderr, err)
			}
		}
	} else if fetchErr != nil {
		err = fetchErr
	}

	return body, r, err
}
