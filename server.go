package main

import (
	"bytes"
	"encoding/json"
	"io"
	"log"
	"net/http"
)

func main() {
	// Serve static files
	fs := http.FileServer(http.Dir("."))
	http.Handle("/", fs)

	// Anthropic proxy
	http.HandleFunc("/api/anthropic", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != "POST" {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}

		var body map[string]interface{}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			http.Error(w, "Invalid JSON", http.StatusBadRequest)
			return
		}

		apiKey, ok := body["apiKey"].(string)
		if !ok || apiKey == "" {
			http.Error(w, "API key required", http.StatusBadRequest)
			return
		}
		delete(body, "apiKey")

		jsonData, _ := json.Marshal(body)
		req, _ := http.NewRequest("POST", "https://api.anthropic.com/v1/messages", bytes.NewBuffer(jsonData))
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("x-api-key", apiKey)
		req.Header.Set("anthropic-version", "2023-06-01")

		client := &http.Client{}
		resp, err := client.Do(req)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		defer resp.Body.Close()

		w.Header().Set("Content-Type", resp.Header.Get("Content-Type"))
		w.WriteHeader(resp.StatusCode)
		io.Copy(w, resp.Body)
	})

	// OpenAI proxy
	http.HandleFunc("/api/openai", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != "POST" {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}

		var body map[string]interface{}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			http.Error(w, "Invalid JSON", http.StatusBadRequest)
			return
		}

		apiKey, ok := body["apiKey"].(string)
		if !ok || apiKey == "" {
			http.Error(w, "API key required", http.StatusBadRequest)
			return
		}
		delete(body, "apiKey")

		jsonData, _ := json.Marshal(body)
		req, _ := http.NewRequest("POST", "https://api.openai.com/v1/chat/completions", bytes.NewBuffer(jsonData))
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("Authorization", "Bearer "+apiKey)

		client := &http.Client{}
		resp, err := client.Do(req)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		defer resp.Body.Close()

		w.Header().Set("Content-Type", resp.Header.Get("Content-Type"))
		w.WriteHeader(resp.StatusCode)
		io.Copy(w, resp.Body)
	})

	http.HandleFunc("/proxy", func(w http.ResponseWriter, r *http.Request) {
		log.Println(r)
	})

	log.Println("🚀 Server running on http://localhost:8080")
	log.Println("📝 Anthropic endpoint: http://localhost:8080/api/anthropic")
	log.Println("📝 OpenAI endpoint: http://localhost:8080/api/openai")
	log.Fatal(http.ListenAndServe(":8080", nil))
}
