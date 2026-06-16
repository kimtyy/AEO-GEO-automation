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
    initContentGeneration();
    initReportGeneration();
    loadMonitoringHistory();
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

        const settingsStoreInfo = document.getElementById('settings-store-info');
        if (settingsStoreInfo) {
            settingsStoreInfo.innerHTML = `
                <div style="font-weight: bold;">매장명</div><div>${STORE_DATA.store_name}</div>
                <div style="font-weight: bold;">브랜드</div><div>${STORE_DATA.brand}</div>
                <div style="font-weight: bold;">주소</div><div>${STORE_DATA.address}</div>
                <div style="font-weight: bold;">업종</div><div>${STORE_DATA.category}</div>
                <div style="font-weight: bold;">컨셉</div><div>${STORE_DATA.concept}</div>
                <div style="font-weight: bold;">크기</div><div>${STORE_DATA.size}</div>
                <div style="font-weight: bold;">주차</div><div>${STORE_DATA.parking ? "가능" : "불가"}</div>
            `;
        }

        const settingsQueriesList = document.getElementById('settings-queries-list');
        if (settingsQueriesList) {
            settingsQueriesList.innerHTML = STORE_DATA.queries.map(q => `
                <li style="margin-bottom: 5px; display: flex; justify-content: space-between;">
                    <span>${q}</span>
                    <button class="btn btn-secondary" style="padding: 2px 8px; font-size: 12px; border:none; background: #e74c3c; color: white; border-radius:3px;">삭제</button>
                </li>
            `).join('');
        }
    } catch (error) {
        console.error('Failed to load store data:', error);
    }
}

// 진단 분석 실행
function initAnalysis() {
    const btnAnalyze = document.getElementById('btn-analyze');
    const analysisResults = document.getElementById('analysis-results');
    const analysisProgress = document.getElementById('analysis-progress');
    const progressBar = document.getElementById('progress-bar');
    const progressText = document.getElementById('progress-text');

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
        
        // 프로그레스 바 표시
        analysisProgress.style.display = 'block';
        progressBar.style.width = '0%';
        progressText.textContent = '0% 완료';

        try {
            // 프로그레스 바 애니메이션 시뮬레이션
            let progress = 0;
            const progressInterval = setInterval(() => {
                progress += 10;
                if (progress <= 90) {
                    progressBar.style.width = `${progress}%`;
                    progressText.textContent = `${progress}% 완료`;
                }
            }, 200);

            // 병렬 API 호출 시뮬레이션
            const prompt = "현재 매장 데이터를 바탕으로 AI 검색 엔진 노출도를 분석해줘.";
            const results = await Promise.all([
                apiService.callClaude(claudeKey, prompt),
                apiService.callChatGPT(chatgptKey, prompt),
                apiService.callGemini(geminiKey, prompt)
            ]);

            clearInterval(progressInterval);
            progressBar.style.width = '100%';
            progressText.textContent = '100% 완료';

            console.log("Analysis Results:", results);
            
            // Supabase에 분석 결과 자동 저장
            await supabaseService.saveAnalysisResult({
                store_id: STORE_DATA.store_name,
                claude_result: results[0],
                chatgpt_result: results[1],
                gemini_result: results[2],
                created_at: new Date().toISOString()
            });
            
            // 결과 표시 (UI 업데이트)
            setTimeout(() => {
                analysisProgress.style.display = 'none';
                analysisResults.style.display = 'block';
                
                document.getElementById('claude-response').textContent = results[0].data;
                document.getElementById('chatgpt-response').textContent = results[1].data;
                document.getElementById('gemini-response').textContent = results[2].data;
                
                // 가상 처방
                document.getElementById('ai-prescription-text').value = `[진단 요약]\nClaude: ${results[0].data}\nChatGPT: ${results[1].data}\nGemini: ${results[2].data}\n\n[추천 액션]\n1. 신메뉴 관련 포스팅 강화\n2. 네이버 플레이스 주차 정보 업데이트`;
            }, 500);

        } catch (error) {
            alert('분석 중 오류가 발생했습니다.');
            console.error(error);
            analysisProgress.style.display = 'none';
        } finally {
            btnAnalyze.textContent = originalText;
            btnAnalyze.disabled = false;
        }
    });
}

function initContentGeneration() {
    const btns = document.querySelectorAll('.btn-generate-content');
    const tableBody = document.querySelector('#content-table tbody');
    
    btns.forEach(btn => {
        btn.addEventListener('click', () => {
            const type = btn.getAttribute('data-type');
            const originalText = btn.textContent;
            btn.textContent = '생성 중...';
            btn.disabled = true;
            
            setTimeout(() => {
                const tr = document.createElement('tr');
                const date = new Date().toLocaleDateString();
                tr.innerHTML = `
                    <td>${date}</td>
                    <td>${type}</td>
                    <td>${STORE_DATA.store_name} ${type} 콘텐츠입니다...</td>
                    <td><span style="color: #3B6D11; font-weight: bold;">생성 완료</span></td>
                `;
                tableBody.prepend(tr);
                
                btn.textContent = originalText;
                btn.disabled = false;
                
                // Save to supabase
                supabaseService.saveContent({
                    store_id: STORE_DATA.store_name,
                    type: type,
                    preview: `${STORE_DATA.store_name} ${type} 콘텐츠입니다...`,
                    status: '완료',
                    created_at: new Date().toISOString()
                });
            }, 1000);
        });
    });
}

function initReportGeneration() {
    const btn = document.getElementById('btn-generate-report');
    if (!btn) return;
    
    btn.addEventListener('click', () => {
        const originalText = btn.textContent;
        btn.textContent = '리포트 생성 중...';
        btn.disabled = true;
        
        setTimeout(() => {
            document.getElementById('report-result').style.display = 'block';
            btn.textContent = originalText;
            btn.disabled = false;
        }, 1500);
    });
}

async function loadMonitoringHistory() {
    const tableBody = document.querySelector('#monitoring-table tbody');
    if (!tableBody) return;

    try {
        const history = await supabaseService.getAnalysisHistory(STORE_DATA.store_name);
        if (history && history.length > 0) {
            tableBody.innerHTML = history.map(h => {
                const date = new Date(h.created_at).toLocaleDateString();
                return `
                    <tr>
                        <td>${date}</td>
                        <td>85</td>
                        <td>72%</td>
                        <td>최근 진단 기록 반영됨</td>
                    </tr>
                `;
            }).join('');
        } else {
            tableBody.innerHTML = `
                <tr>
                    <td>2026.05.15</td>
                    <td>85</td>
                    <td>72%</td>
                    <td>신메뉴 키워드 반영</td>
                </tr>
                <tr>
                    <td>2026.05.01</td>
                    <td>82</td>
                    <td>68%</td>
                    <td>주차 정보 업데이트 반영</td>
                </tr>
            `;
        }
    } catch (error) {
        console.error('Failed to load history:', error);
    }
}

