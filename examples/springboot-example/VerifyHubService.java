package com.example.verifyhub;

import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestTemplate;

import java.util.HashMap;
import java.util.Map;

@Service
public class VerifyHubService {
    private final String baseUrl = "http://localhost:3000/v1";
    private final String apiKey = "vh_live_example_key";
    private final RestTemplate restTemplate = new RestTemplate();

    public Map<String, Object> createChallenge(String channel, String purpose, String destination) {
        String url = baseUrl + "/challenges";

        HttpHeaders headers = new HttpHeaders();
        headers.set("Content-Type", "application/json");
        headers.set("x-api-key", apiKey);

        Map<String, Object> body = new HashMap<>();
        body.put("channel", channel);
        body.put("purpose", purpose);
        body.put("destination", destination);
        body.put("locale", "es");

        HttpEntity<Map<String, Object>> entity = new HttpEntity<>(body, headers);
        ResponseEntity<Map> response = restTemplate.exchange(url, HttpMethod.POST, entity, Map.class);
        return response.getBody();
    }

    public Map<String, Object> verifyChallenge(String challengeId, String code) {
        String url = baseUrl + "/challenges/" + challengeId + "/verify";

        HttpHeaders headers = new HttpHeaders();
        headers.set("Content-Type", "application/json");
        headers.set("x-api-key", apiKey);

        Map<String, Object> body = new HashMap<>();
        body.put("code", code);

        HttpEntity<Map<String, Object>> entity = new HttpEntity<>(body, headers);
        ResponseEntity<Map> response = restTemplate.exchange(url, HttpMethod.POST, entity, Map.class);
        return response.getBody();
    }
}
