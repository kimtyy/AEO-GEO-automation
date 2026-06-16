// js/api.js - AI API 호출 관리 (서버리스 함수 경유)

const apiService = {
    /**
     * Claude API 호출
     * @param {string} prompt 
     */
    async callClaude(prompt) {
        console.log("Calling Claude API via Serverless...");
        const response = await fetch('/api/claude', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ prompt })
        });
        if (!response.ok) throw new Error("Claude API Request Failed");
        return await response.json();
    },

    /**
     * ChatGPT API 호출
     * @param {string} prompt 
     */
    async callChatGPT(prompt) {
        console.log("Calling ChatGPT API via Serverless...");
        const response = await fetch('/api/chatgpt', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ prompt })
        });
        if (!response.ok) throw new Error("ChatGPT API Request Failed");
        return await response.json();
    },

    /**
     * Gemini API 호출
     * @param {string} prompt 
     */
    async callGemini(prompt) {
        console.log("Calling Gemini API via Serverless...");
        const response = await fetch('/api/gemini', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ prompt })
        });
        if (!response.ok) throw new Error("Gemini API Request Failed");
        return await response.json();
    }
};
