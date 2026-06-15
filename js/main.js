// js/main.js - 네비게이션, 탭 전환, 데이터 로드, 분석 실행

const STORE_DATA = {
  "store_name": "설맥 가평현리점",
  "brand": "SOL MAC",
  "address": "경기 가평군 조종면 조종희망로 16-19",
  "category": "호프/맥주집",
  "concept": "눈꽃맥주 전문점, 밥술집",
  "size": "70평",
  "rooms": ["30인 단체룸", "12인 단체룸"],
  "parking": true,
  "hours": {
    "mon_thu": "17:00 ~ 24:00",
    "fri_sat": "17:00 ~ 01:00"
  },
  "menu": ["설맥치킨", "눈꽃치킨", "아구찜", "코다리찜", "냉면", "쌀국수", "골뱅이무침", "눈꽃빙수"],
  "keywords": ["가평 현리 단체 회식", "현리 밥술집", "현리 맥주집", "맹호부대 근처 회식"],
  "queries": [
    "가평 현리 단체 회식 장소 추천해줘",
    "가평 현리 밥술집 어디 있어?",
    "현리에서 늦게까지 하는 술집 알려줘",
    "가평 현리 맛집 추천해줘",
    "맹호부대 근처 단체 회식 장소"
  ]
};

document.addEventListener('DOMContentLoaded', () => {
    initNavigation();
    initTabs();
    loadStoreData();
    chartService.initCharts();
    initAnalysis();
});

// 사이드바 네비게이션
function initNavigation() {
    const menuItems = document.querySelectorAll('#sidebar-menu li');
    const pages = document.querySelectorAll('.page');
    const pageTitle = document.getElementById('page-title');

    menuItems.forEach(item => {
        item.addEventListener('click', () => {
            // Update Active Menu
            menuItems.forEach(m => m.classList.remove('active'));
            item.classList.add('active');

            // Update Active Page
            const targetId = item.getAttribute('data-target');
            pages.forEach(p => p.classList.remove('active'));
            document.getElementById(targetId).classList.add('active');

            // Update Title
            pageTitle.textContent = item.textContent;
            
            // Re-render charts if dashboard is shown (fixes Chart.js resize issue)
            if (targetId === 'page-dashboard') {
                chartService.updateCharts({
                    radar: [85, 70, 90, 60, 80],
                    bar: [82, 65, 70, 45, 30]
                });
            }
        });
    });
}

// 대시보드 하단 탭
function initTabs() {
    const tabs = document.querySelectorAll('#dashboard-tabs .tab');
    const tabPanes = document.querySelectorAll('.tab-pane');

    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            tabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');

            const targetId = tab.getAttribute('data-target');
            tabPanes.forEach(pane => pane.classList.remove('active'));
            document.getElementById(targetId).classList.add('active');
        });
    });
}

// STORE_DATA 변수 데이터 로드
function loadStoreData() {
    try {
        const storeHeaderInfo = document.getElementById('store-header-info');
        if (storeHeaderInfo) {
            storeHeaderInfo.innerHTML = `
                <strong>${STORE_DATA.store_name}</strong> | 
                ${STORE_DATA.category} | 
                ${STORE_DATA.address}
            `;
        }
    } catch (error) {
        console.error('Failed to load store data:', error);
    }
}

// 진단 분석 실행
function initAnalysis() {
    const btnAnalyze = document.getElementById('btn-analyze');
    const analysisResults = document.getElementById('analysis-results');

    if (!btnAnalyze) return;

    btnAnalyze.addEventListener('click', async () => {
        const claudeKey = document.getElementById('claude-key').value;
        const chatgptKey = document.getElementById('chatgpt-key').value;
        const geminiKey = document.getElementById('gemini-key').value;

        // 버튼 상태 변경
        const originalText = btnAnalyze.textContent;
        btnAnalyze.textContent = "분석 중...";
        btnAnalyze.disabled = true;
        analysisResults.style.display = 'none';

        try {
            // 병렬 API 호출 시뮬레이션
            const prompt = "현재 매장 데이터를 바탕으로 AI 검색 엔진 노출도를 분석해줘.";
            const results = await Promise.all([
                apiService.callClaude(claudeKey, prompt),
                apiService.callChatGPT(chatgptKey, prompt),
                apiService.callGemini(geminiKey, prompt)
            ]);

            console.log("Analysis Results:", results);
            
            // 결과 표시 (UI 업데이트 로직은 HTML에 미리 작성된 상태로 보이기만 처리)
            analysisResults.style.display = 'block';

        } catch (error) {
            alert('분석 중 오류가 발생했습니다.');
            console.error(error);
        } finally {
            btnAnalyze.textContent = originalText;
            btnAnalyze.disabled = false;
        }
    });
}
