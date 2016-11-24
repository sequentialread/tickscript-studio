package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	htmlTemplate "html/template"
	"io/ioutil"
	"net/http"
	"strconv"
	"time"
)

var (
	landingPageTemplate *htmlTemplate.Template
	config              map[string]interface{}
	appVersion          string
)

type windowViewModel struct {
	Version string
}

type javaScriptError struct {
	Location   string
	Message    string
	File       string
	Line       int
	Column     int
	StackTrace string
	JSDateMs   int64
	Username   string
}

func landingPage(response http.ResponseWriter, request *http.Request) {
	if request.URL.Path != "/" {
		response.WriteHeader(404)
		fmt.Fprintf(response, "404 not found: %s", request.URL.Path)
		return
	}
	var bodyBuffer bytes.Buffer
	err := landingPageTemplate.Execute(&bodyBuffer, windowViewModel{
		Version: appVersion,
	})
	if err != nil {
		response.WriteHeader(500)
		fmt.Fprintf(response, "tryWriteHtml failed with '%s'", err)
		return
	}
	response.Write(bodyBuffer.Bytes())
}

func ping(response http.ResponseWriter, request *http.Request) {
	response.WriteHeader(204)
}

func logError(response http.ResponseWriter, request *http.Request) {

	bodyBytes, err := ioutil.ReadAll(request.Body)
	if err != nil {
		fmt.Printf("can't log error because '%s'\n", err)
		return
	}

	if config["errorLogType"].(string) == "human" {
		var javascriptErrorInstance javaScriptError
		err = json.Unmarshal(bodyBytes, &javascriptErrorInstance)
		if err != nil {
			fmt.Printf("Javascript Error: \n%s", bodyBytes)
			return
		}
		fmt.Printf("Javascript Error:\n"+
			"Location: %s\nFile: %s at line (%s:%s)\nDateTime: %s\nUser: %s\nMessage: %s\n\nStackTrace: %s\n\n",
			javascriptErrorInstance.Location,
			javascriptErrorInstance.File,
			strconv.Itoa(javascriptErrorInstance.Line),
			strconv.Itoa(javascriptErrorInstance.Column),
			time.Unix(javascriptErrorInstance.JSDateMs/1000, 0),
			javascriptErrorInstance.Username,
			javascriptErrorInstance.Message,
			javascriptErrorInstance.StackTrace,
		)
	} else {
		fmt.Printf("%s", string(bodyBytes))
	}

	response.Write([]byte("ok"))
}

func main() {

	var err error
	landingPageTemplate, err = htmlTemplate.ParseFiles("server/index.html")
	if err != nil {
		fmt.Printf("can't start server because '%s'\n", err)
		return
	}
	versionFile, err := ioutil.ReadFile("VERSION")
	if err != nil {
		fmt.Printf("can't start server because '%s'\n", err)
		return
	}
	appVersion = string(versionFile)

	configFile, err := ioutil.ReadFile("config.json")
	if err != nil {
		fmt.Printf("can't start server because '%s'\n", err)
		return
	}
	err = json.Unmarshal(configFile, &config)
	if err != nil {
		fmt.Printf("can't start server because '%s'\n", err)
		return
	}

	err = initializeWrapKapacitor()
	if err != nil {
		fmt.Printf("can't start server because '%s'\n", err)
		return
	}

	err = initializeTaskGraph()
	if err != nil {
		fmt.Printf("can't start server because '%s'\n", err)
		return
	}

	err = initializeApiProxy()
	if err != nil {
		fmt.Printf("can't start server because '%s'\n", err)
		return
	}

	http.HandleFunc("/", landingPage)
	http.HandleFunc("/ping", ping)
	http.HandleFunc("/logError", logError)

	http.Handle("/static/", http.StripPrefix("/static/", http.FileServer(http.Dir("./static/"))))
	http.Handle("/fonts/", http.StripPrefix("/fonts/", http.FileServer(http.Dir("./static/fonts/"))))

	// serve source files for source maps
	http.Handle("/static/frontend/", http.StripPrefix("/static/frontend/", http.FileServer(http.Dir("./frontend/"))))
	http.Handle("/frontend/", http.StripPrefix("/frontend/", http.FileServer(http.Dir("./frontend/"))))

	if config["serveHTTPS"].(bool) == true {
		http.ListenAndServeTLS(":"+config["listenPort"].(string), "test-server.pem", "test-server.key", nil)
	} else {
		http.ListenAndServe(":"+config["listenPort"].(string), nil)
	}
}
