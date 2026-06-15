// js/api.js - AI API 호출 관리

const apiService = {
    /**
     * Claude API 호출 (가상 함수)
     * @param {string} apiKey 
     * @param {string} prompt 
     */
    async callClaude(apiKey, prompt) {
        console.log("Calling Claude API...");
        return new Promise((resolve) => {
            setTimeout(() => {
                resolve({
                    ai: "Claude",
                    status: "success",
                    message: "진단 완료",
                    data: "가평 현리 단체 회식 키워드에서 우수한 추천을 보이고 있습니다."
                });
            }, 1000);
        });
    },

    /**
     * ChatGPT API 호출 (가상 함수)
     * @param {string} apiKey 
     * @param {string} prompt 
     */
    async callChatGPT(apiKey, prompt) {
        console.log("Calling ChatGPT API...");
        return new Promise((resolve) => {
            setTimeout(() => {
                resolve({
                    ai: "ChatGPT",
                    status: "warning",
                    message: "진단 완료",
                    data: "주차 및 영업시간 관련 환각(Hallucination)이 감지되었습니다."
                });
            }, 1200);
        });
    },

    /**
     * Gemini API 호출 (가상 함수)
     * @param {string} apiKey 
     * @param {string} prompt 
     */
    async callGemini(apiKey, prompt) {
        console.log("Calling Gemini API...");
        return new Promise((resolve) => {
            setTimeout(() => {
                resolve({
                    ai: "Gemini",
                    status: "normal",
                    message: "진단 완료",
                    data: "신메뉴(눈꽃빙수)에 대한 데이터 학습이 부족합니다."
                });
            }, 1500);
        });
    }
};
