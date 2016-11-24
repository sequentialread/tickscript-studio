package main

import (
	"encoding/json"
	"fmt"
	textTemplate "html/template"
	"io/ioutil"
	"net/http"
	"os/exec"
	"sort"
	"strings"
	"sync"
	"time"

	influxdbModels "github.com/influxdata/influxdb/models"
)

var (
	resultsTemplate           *textTemplate.Template
	kapacitorOutputCache      = make([]influxdbModels.Point, 0)
	kapacitorAlertCache       = make([]string, 0)
	kapacitorOutputCacheMutex sync.Mutex
	activeUser                *lockUser
)

type lockUser struct {
	DisplayName string
	Id          string
	LockedAt    time.Time
}

type rowBuilder struct {
	ColumnIdsByColumn map[string]*int
	SortedColumns     []string
	Row               influxdbModels.Row
}

func kapacitorLogsHandler(response http.ResponseWriter, request *http.Request) {
	if request.Method == "GET" {
		readKapacitorLogs(response, request)
	} else if request.Method == "DELETE" {
		clearKapacitorLogs(response, request)
	} else {
		response.Header().Add("Allow", "GET, DELETE")
		response.WriteHeader(405)
		fmt.Fprint(response, "405 Method Not Supported")
	}
}

func outputHandler(response http.ResponseWriter, request *http.Request) {
	if request.Method == "GET" {
		getOutput(response, request)
	} else if request.Method == "DELETE" {
		clearOutput(response, request)
	} else {
		response.Header().Add("Allow", "GET, DELETE")
		response.WriteHeader(405)
		fmt.Fprint(response, "405 Method Not Supported")
	}
}

func alertsHandler(response http.ResponseWriter, request *http.Request) {
	if request.Method == "GET" {
		getAlerts(response, request)
	} else if request.Method == "DELETE" {
		clearAlerts(response, request)
	} else {
		response.Header().Add("Allow", "GET, DELETE")
		response.WriteHeader(405)
		fmt.Fprint(response, "405 Method Not Supported")
	}
}

func lockHandler(response http.ResponseWriter, request *http.Request) {
	newUserId := request.URL.Query().Get("id")
	newUserDisplayName := request.URL.Query().Get("name")
	if newUserId == "" || newUserDisplayName == "" {
		response.WriteHeader(400)
		fmt.Fprint(response, "400 name and id are required")
		return
	}
	if request.Method == "GET" {
		aquireLock(response, newUserId, newUserDisplayName)
	} else if request.Method == "DELETE" {
		clearLock(response, newUserId, newUserDisplayName)
	} else {
		response.Header().Add("Allow", "GET, DELETE")
		response.WriteHeader(405)
		fmt.Fprint(response, "405 Method Not Supported")
	}
}

func aquireLock(response http.ResponseWriter, newUserId string, newUserDisplayName string) {
	kapacitorOutputCacheMutex.Lock()
	defer kapacitorOutputCacheMutex.Unlock()
	secondsAgo := 0
	if activeUser != nil {
		secondsAgo = int(time.Since(activeUser.LockedAt).Seconds())
	}
	if activeUser == nil || activeUser.Id == newUserId || secondsAgo > 60 {
		activeUser = &lockUser{
			DisplayName: newUserDisplayName,
			Id:          newUserId,
			LockedAt:    time.Now(),
		}
	} else {
		response.WriteHeader(403)
		fmt.Fprintf(
			response,
			"403 Forbidden: kapacitor is currently being used by '%s' %d seconds ago",
			activeUser.DisplayName,
			secondsAgo,
		)
	}
}

func clearLock(response http.ResponseWriter, newUserId string, newUserDisplayName string) {
	kapacitorOutputCacheMutex.Lock()
	defer kapacitorOutputCacheMutex.Unlock()
	if activeUser != nil {
		if activeUser.Id == newUserId {
			activeUser = nil
		} else {
			response.WriteHeader(403)
			fmt.Fprintf(response, "403 Forbidden: you may not clear the lock held by '%s'", activeUser.DisplayName)
		}
	}
}

func readKapacitorLogs(response http.ResponseWriter, request *http.Request) {
	fileName := fmt.Sprintf("%s/kapacitor.log", config["kapacitorLogFolder"].(string))

	bytes, err := ioutil.ReadFile(fileName)
	if err != nil {
		response.WriteHeader(500)
		fmt.Fprintf(response, "unable to read file %s because %s", fileName, err)
		return
	}
	logString := string(bytes)
	filteredLogLines := make([]string, 0)
	for _, line := range strings.Split(logString, "\n") {
		if !strings.Contains(line, "GET /kapacitor/v1/tasks") && !strings.Contains(line, "GET /kapacitor/v1/ping") {
			filteredLogLines = append(filteredLogLines, line)
		}
	}

	response.Header().Add("Content-Type", "text/plain")
	response.Write([]byte(strings.Join(filteredLogLines, "\n")))

}

func clearKapacitorLogs(response http.ResponseWriter, request *http.Request) {
	fileName := fmt.Sprintf("%s/kapacitor.log", config["kapacitorLogFolder"].(string))
	cmd := exec.Command(config["bashPath"].(string), "./clearFile.sh", fileName)
	err := cmd.Start()

	if err != nil {
		response.WriteHeader(500)
		fmt.Fprintf(response, "unable to write file %s because %s", fileName, err)
	} else {
		response.WriteHeader(200)
		fmt.Fprintf(response, "wrote file %s ok", fileName)
	}
}

func acceptLineProtocolFromKapacitor(response http.ResponseWriter, request *http.Request) {
	bodyBytes, err := ioutil.ReadAll(request.Body)
	if err != nil {
		response.WriteHeader(500)
		fmt.Printf("can't injest line protocol because '%s'\n", err)
		return
	}

	//fmt.Printf("lp'%s'\n", string(bodyBytes))

	points, err := influxdbModels.ParsePoints(bodyBytes)
	if err != nil {
		response.WriteHeader(500)
		fmt.Printf("can't injest line protocol because '%s'\n", err)
		return
	}

	kapacitorOutputCacheMutex.Lock()
	kapacitorOutputCache = append(kapacitorOutputCache, points...)
	kapacitorOutputCacheMutex.Unlock()
}

func acceptAlertFromKapacitor(response http.ResponseWriter, request *http.Request) {
	bodyBytes, err := ioutil.ReadAll(request.Body)
	if err != nil {
		response.WriteHeader(500)
		fmt.Printf("can't injest alert because '%s'\n", err)
		return
	}

	kapacitorOutputCacheMutex.Lock()
	kapacitorAlertCache = append(kapacitorAlertCache, string(bodyBytes))
	kapacitorOutputCacheMutex.Unlock()
}

func getAlerts(response http.ResponseWriter, request *http.Request) {
	kapacitorOutputCacheMutex.Lock()
	defer kapacitorOutputCacheMutex.Unlock()

	alertsCommaDelimited := strings.Join(kapacitorAlertCache, ",")

	response.Header().Add("Content-Type", "application/json")
	response.Write([]byte("["))
	response.Write([]byte(alertsCommaDelimited))
	response.Write([]byte("]"))
}

func getOutput(response http.ResponseWriter, request *http.Request) {

	kapacitorOutputCacheMutex.Lock()
	defer kapacitorOutputCacheMutex.Unlock()

	rowBuilders := make(map[string]*rowBuilder)

	for _, point := range kapacitorOutputCache {
		seriesName := point.Name()
		if rowBuilders[seriesName] == nil {
			rowBuilders[seriesName] = &rowBuilder{
				ColumnIdsByColumn: make(map[string]*int),
				Row: influxdbModels.Row{
					Name: seriesName,
				},
			}
		}
		columnIdsByColumn := rowBuilders[seriesName].ColumnIdsByColumn
		defaultInt := 1
		for _, tag := range point.Tags() {
			tagName := string(tag.Key)
			if columnIdsByColumn[tagName] == nil {
				columnIdsByColumn[tagName] = &defaultInt
			}
		}
		for fieldName, _ := range point.Fields() {
			if columnIdsByColumn[fieldName] == nil {
				columnIdsByColumn[fieldName] = &defaultInt
			}
		}
	}

	for _, rowBuilder := range rowBuilders {
		for column, _ := range rowBuilder.ColumnIdsByColumn {
			rowBuilder.SortedColumns = append(rowBuilder.SortedColumns, column)
		}
		sort.Strings(rowBuilder.SortedColumns)
		for _, column := range rowBuilder.SortedColumns {
			columnIndex := len(rowBuilder.Row.Columns)
			rowBuilder.ColumnIdsByColumn[column] = &columnIndex
			rowBuilder.Row.Columns = append(rowBuilder.Row.Columns, column)
		}
	}

	for _, point := range kapacitorOutputCache {
		rowBuilder := rowBuilders[point.Name()]
		values := make([]interface{}, len(rowBuilder.Row.Columns))
		for _, tag := range point.Tags() {
			tagName := string(tag.Key)
			values[*rowBuilder.ColumnIdsByColumn[tagName]] = string(tag.Value)
		}
		for fieldName, fieldValue := range point.Fields() {
			values[*rowBuilder.ColumnIdsByColumn[fieldName]] = fieldValue
		}
		rowBuilder.Row.Values = append(rowBuilder.Row.Values, values)
	}

	rows := make([]influxdbModels.Row, 0)
	for _, rowBuilder := range rowBuilders {
		rows = append(rows, rowBuilder.Row)
	}

	jsonBytes, err := json.Marshal(rows)
	if err != nil {
		response.WriteHeader(500)
		fmt.Printf("can't return results because '%s'\n", err)
		return
	}

	response.Header().Add("Content-Type", "application/json")
	response.Write(jsonBytes)
}

func clearAlerts(response http.ResponseWriter, request *http.Request) {
	kapacitorOutputCacheMutex.Lock()
	kapacitorAlertCache = make([]string, 0)
	kapacitorOutputCacheMutex.Unlock()
}

func clearOutput(response http.ResponseWriter, request *http.Request) {

	kapacitorOutputCacheMutex.Lock()
	kapacitorOutputCache = make([]influxdbModels.Point, 0)
	kapacitorOutputCacheMutex.Unlock()
}

func initializeWrapKapacitor() error {

	http.HandleFunc("/kapacitorLogs", kapacitorLogsHandler)
	http.HandleFunc("/write", acceptLineProtocolFromKapacitor)
	http.HandleFunc("/alert", acceptAlertFromKapacitor)
	http.HandleFunc("/kapacitorLock", lockHandler)
	http.HandleFunc("/output", outputHandler)
	http.HandleFunc("/alerts", alertsHandler)

	return nil
}
