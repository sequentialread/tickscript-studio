package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"io/ioutil"
	"net/http"
	"net/url"
	"os/exec"
	"regexp"
	"strconv"
)

type tasksResult struct {
	Tasks []taskResult
}

type taskResult struct {
	Dot string
}

func getGraph(response http.ResponseWriter, request *http.Request) {

	getTasksURL := &url.URL{
		Scheme: config["kapacitorScheme"].(string),
		Host:   config["kapacitorHost"].(string),
		Path:   "/kapacitor/v1/tasks",
	}

	getTasksResponse, err := http.Get(getTasksURL.String())
	if err != nil {
		response.WriteHeader(500)
		fmt.Fprintf(response, "500 error cannot GET %s, %s", getTasksURL.String(), err)
		return
	}
	body, err := ioutil.ReadAll(getTasksResponse.Body)
	if err != nil {
		response.WriteHeader(500)
		fmt.Fprintf(response, "500 error cannot read GET %s, %s", getTasksURL.String(), err)
		return
	}

	var tasksResultInstance tasksResult
	err = json.Unmarshal(body, &tasksResultInstance)
	if err != nil {
		response.WriteHeader(500)
		fmt.Fprintf(response, "500 error cannot parse json from %s, %s", getTasksURL.String(), err)
		return
	}
	if len(tasksResultInstance.Tasks) == 0 {
		response.WriteHeader(500)
		fmt.Fprintf(response, "500 error no tasks returned from %s", getTasksURL.String())
		return
	}
	dot := tasksResultInstance.Tasks[0].Dot

	dotPreProcess := [][]string{
		[]string{
			`"`,
			``,
		},
		[]string{
			`digraph [0-9A-Fa-f]{8}-([0-9A-Fa-f]{4}-){3}[0-9A-Fa-f]{12} \{`,
			`digraph g {
         node [fontname = "sans-serif"];
         edge [fontname = "sans-serif"];`,
		},
		[]string{
			`graph \[([^\]]+)\];`,
			`graph [label="$1" rankdir="LR" fontname = "sans-serif"];`,
		},
		[]string{
			`
(\s*[a-zA-Z_-]+[0-9]+) \[([^\]]+)\];`,
			`
$1 [xlabel="$2"];`,
		},
		[]string{
			`
(\s*[a-zA-Z_-]+[0-9]+) -> ([a-zA-Z]+[0-9]+) \[([^\]]+)\];`,
			`
$1 -> $2 [label="$3"];`,
		},
		[]string{
			`avg_exec_time_ns=`,
			`exec_ns=`,
		},
	}
	for _, searchAndReplace := range dotPreProcess {
		search, err := regexp.Compile(searchAndReplace[0])
		if err != nil {
			response.WriteHeader(500)
			fmt.Fprintf(response, "500 error can't compile regex: %s, \n\n %s", searchAndReplace[0], err)
			return
		}
		dot = search.ReplaceAllString(dot, searchAndReplace[1])
	}

	dotProcess := exec.Command("dot", "-Tsvg")
	var dotProcessStdoutBuffer, dotProcessStderrBuffer bytes.Buffer
	dotProcess.Stdout = &dotProcessStdoutBuffer
	dotProcess.Stderr = &dotProcessStderrBuffer
	dotProcessStdin, err := dotProcess.StdinPipe()
	if err != nil {
		response.WriteHeader(500)
		fmt.Fprintf(response, "500 error can't open stdin to dot process: %s", err)
		return
	}
	err = dotProcess.Start()
	if err != nil {
		response.WriteHeader(500)
		fmt.Fprintf(response, "500 error can't start dot process: %s", err)
		return
	}

	_, err = io.WriteString(dotProcessStdin, dot)
	if err != nil {
		response.WriteHeader(500)
		fmt.Fprintf(response, "500 error from closing dot process stdin: %s", err)
		dotProcessStdin.Close()
		return
	}
	err = dotProcessStdin.Close()
	if err != nil {
		response.WriteHeader(500)
		fmt.Fprintf(response, "500 error from closing dot process stdin: %s", err)
		return
	}
	err = dotProcess.Wait()
	if err != nil {
		response.WriteHeader(500)
		fmt.Fprintf(response, "500 error from dot process: \n\n %s, \n\n %s,\n\n %s", dot, dotProcessStderrBuffer.String(), err)
	} else {
		resultBytes := dotProcessStdoutBuffer.Bytes()
		response.Header().Add("Connection", "keep-alive")
		response.Header().Add("Accept-Ranges", "bytes")
		response.Header().Add("Cache-Control", "public,max-age=0,public")
		response.Header().Add("Content-Length", strconv.Itoa(len(resultBytes)))
		response.Header().Add("Content-Type", "image/svg+xml")
		response.Write(resultBytes)
	}
}

func initializeTaskGraph() error {

	http.HandleFunc("/graph.svg", getGraph)

	return nil
}
