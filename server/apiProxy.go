package main

import (
	"bytes"
	"fmt"
	"io"
	"io/ioutil"
	"net/http"
	"net/url"
	"os"
	"strings"
)

var (
	debugLogMode       bool
	proxyConfiguration map[string]proxyEndpoint
)

type proxyEndpoint struct {
	url     url.URL
	setAuth func(*http.Request, *http.Request)
}

func apiProxy(response http.ResponseWriter, request *http.Request) {
	pathElements := strings.Split(request.URL.Path, "/")

	proxyURL := proxyConfiguration[pathElements[1]].url

	proxyURL.Path = strings.Join(pathElements[2:], "/")
	proxyURL.RawQuery = request.URL.RawQuery

	body, err := ioutil.ReadAll(request.Body)
	if err != nil {
		response.WriteHeader(500)
		fmt.Fprintf(response, "500 ioutil.ReadAll err in proxy: %s", err)
		return
	}

	client := &http.Client{}
	proxyRequest, err := http.NewRequest(request.Method, proxyURL.String(), bytes.NewBuffer(body))
	if err != nil {
		response.WriteHeader(500)
		fmt.Fprintf(response, "error getting proxy request %s", err)
		return
	}
	proxyRequest.Header = http.Header{"Content-Type": []string{"application/json"}}

	for k, v := range request.Header {
		if k == "Content-Type" || k == "Content-Length" || k == "Accept" {
			proxyRequest.Header[k] = v
		}
	}

	proxyConfiguration[pathElements[1]].setAuth(request, proxyRequest)

	if debugLogMode {
		fmt.Printf("url %s\n", proxyRequest.URL.String())
		fmt.Printf("header %s\n", proxyRequest.Header)
		fmt.Printf("method %s\n", proxyRequest.Method)
		fmt.Printf("body %s\n", body)
	}

	proxyResponse, err := client.Do(proxyRequest)
	if err != nil {
		response.WriteHeader(500)
		fmt.Fprintf(response, "500 %s", err)
	} else {
		for k, v := range proxyResponse.Header {
			if debugLogMode {
				fmt.Printf("header %s  %s\n", k, v)
			}

			// kapacitor has a bug where it will return plain text responses with content-type 'application/json'
			// when it errors, which breaks AngularJS internals
			isKapacitorWriteError := pathElements[1] == "kapacitor" && pathElements[2] == "write" && proxyResponse.StatusCode > 300
			if isKapacitorWriteError && strings.ToLower(k) == "content-type" {
				continue
			}

			response.Header().Set(k, v[0])
		}
		response.WriteHeader(proxyResponse.StatusCode)
		io.Copy(response, proxyResponse.Body)
	}
}

func __toggleDebugLog(response http.ResponseWriter, request *http.Request) {
	debugLogMode = !debugLogMode
	fmt.Fprintf(response, "ok")
}

func getConfigValueFromConfigOrFromEnvironmentVariable(configName string, environmentVariable string) string {
	environmentVariableResult := os.ExpandEnv("$" + environmentVariable)
	configResult := config[configName]
	if environmentVariableResult != "" {
		return environmentVariableResult
	}
	if configResult != nil {
		return configResult.(string)
	}
	return ""
}

func initializeApiProxy() error {
	debugLogMode = false
	proxyConfiguration = map[string]proxyEndpoint{
		"influxdb": proxyEndpoint{
			url: url.URL{
				Scheme: getConfigValueFromConfigOrFromEnvironmentVariable("influxDbScheme", "TICKSCRIPT_STUDIO_INFLUXDB_SCHEME"),
				Host:   getConfigValueFromConfigOrFromEnvironmentVariable("influxDbHost", "TICKSCRIPT_STUDIO_INFLUXDB_HOST"),
			},
			setAuth: func(request *http.Request, proxyRequest *http.Request) {
				username := getConfigValueFromConfigOrFromEnvironmentVariable("influxDbUsername", "TICKSCRIPT_STUDIO_INFLUXDB_USERNAME")
				password := getConfigValueFromConfigOrFromEnvironmentVariable("influxDbPassword", "TICKSCRIPT_STUDIO_INFLUXDB_PASSWORD")
				if password != "" || username != "" {
					proxyRequest.SetBasicAuth(username, password)
				}
			},
		},
		"kapacitor": proxyEndpoint{
			url: url.URL{
				Scheme: config["kapacitorScheme"].(string),
				Host:   config["kapacitorHost"].(string),
			},
			setAuth: func(request *http.Request, proxyRequest *http.Request) {
			},
		},
	}

	for key, _ := range proxyConfiguration {
		http.HandleFunc("/"+key+"/", apiProxy)
	}

	http.HandleFunc("/__toggleDebugLog", __toggleDebugLog)

	return nil
}
