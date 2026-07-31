// js/main.js - 네비게이션, 탭 전환, 데이터 로드, 분석 실행

let currentStore = null;
let storesList = [];

document.addEventListener('DOMContentLoaded', async () => {
    initNavigation();
    initTabs();
    chartService.initCharts();
    initAnalysis();
    initContentGeneration();
    initReportGeneration();
    
    await initStores();
    
    initSettingsWizard();   // Phase 1: AI 자동완성 마법사
    initAdvancedToggle();   // 고급 설정 접기/펼치기
    initMonitoringTab();    // Phase 2: 모니터링 신뢰구간
    initSettingsEdit();
    initNewStoreModal();
    initContentViewModal();
    initDistributionTab();   // Phase 4: 채널 배포 (오토파일럿)
});

async function initStores() {
    const selector = document.getElementById('store-selector');
    storesList = await supabaseService.getAllStores();
    
    if (storesList && storesList.length > 0) {
        currentStore = storesList[0];
    }
    
    renderStoreSelector();
    
    selector.addEventListener('change', async (e) => {
        if (e.target.value === 'add_new') {
            document.getElementById('new-store-modal').style.display = 'block';
            selector.value = currentStore ? currentStore.id : '';
            return;
        }
        currentStore = storesList.find(s => s.id === e.target.value);
        await refreshDashboard();
    });
    
    await refreshDashboard();
}

function renderStoreSelector() {
    const selector = document.getElementById('store-selector');
    if (!selector) return;
    
    selector.innerHTML = '';
    
    if (storesList && storesList.length > 0) {
        storesList.forEach(store => {
            const option = document.createElement('option');
            option.value = store.id;
            option.textContent = store.store_name || store.brand;
            if (currentStore && currentStore.id === store.id) {
                option.selected = true;
            }
            selector.appendChild(option);
        });
    } else {
        const option = document.createElement('option');
        option.value = "";
        option.disabled = true;
        option.textContent = "업체가 없습니다";
        selector.appendChild(option);
    }
    
    const addOption = document.createElement('option');
    addOption.value = 'add_new';
    addOption.textContent = '+ 새 업체 추가';
    selector.appendChild(addOption);
}

async function refreshDashboard() {
    await loadStoreData();
    await loadMonitoringHistory();
    await loadCompetitorAnalysis();
    await updateDashboardData();
    updateQarelScore();
    await loadLatestDiagnosisResults();
}

function updateQarelScore() {
    if (!currentStore) return;
    
    // Q: 질문 개수 / 20 * 100
    let queries = currentStore.queries || [];
    if (typeof queries === 'string') {
        try { queries = JSON.parse(queries); } catch(e) { queries = []; }
    }
    const qCount = queries.length;
    const qScore = Math.min(100, Math.round((qCount / 20) * 100));
    
    // L: 지역성 (keywords 배열 개수 / 10 * 100)
    let keywords = currentStore.keywords || [];
    if (typeof keywords === 'string') {
        try { keywords = JSON.parse(keywords); } catch(e) { keywords = []; }
    }
    const lCount = keywords.length;
    const lScore = Math.min(100, Math.round((lCount / 10) * 100));
    
    // A, R, E (임시 0점)
    const aScore = 0;
    const rScore = 0;
    const eScore = 0;
    
    const qarelData = [qScore, aScore, rScore, eScore, lScore];
    chartService.updateQarelCharts(qarelData);
}

async function updateDashboardData() {
    if (!currentStore) return;
    
    try {
        // 1. Fetch analysis history (monitoring mode only), contents, and monitoring weekly summaries in parallel
        const [history, contents, summaries] = await Promise.all([
            supabaseService.getAnalysisHistory(currentStore.id, 'monitoring'),
            supabaseService.getContents(currentStore.id),
            supabaseService.getMonitoringSummary(currentStore.id, 8)
        ]);
        
        // 2. Compute KPI values
        let visibilityScore = 0;
        let mentionRate = 0;
        let queriesCount = 0;
        let nextDateStr = '측정 대기';
        let contentCount = contents ? contents.length : 0;
        
        // Parse queries
        let queries = currentStore.queries || [];
        if (typeof queries === 'string') {
            try { queries = JSON.parse(queries); } catch(e) { queries = []; }
        }
        queriesCount = queries.length;
        
        let latestGroup = [];
        let weightedLower = 0;
        let weightedUpper = 0;
        let totalN = 0;

        if (history && history.length > 0) {
            const latestTime = history[0].created_at;
            latestGroup = history.filter(h => h.created_at === latestTime);
            
            // 자사 데이터 필터링
            const selfRows = latestGroup.filter(r => !r.query.includes('[경쟁사:'));
            
            if (selfRows.length > 0) {
                let totalScore = 0;
                selfRows.forEach(r => {
                    totalScore += Number(r.score) || 0;
                });
                visibilityScore = Math.round(totalScore / selfRows.length);
            }
            
            // 다음 측정일 계산 (마지막 측정일 + 7일)
            const latestDate = new Date(latestTime);
            const nextMeasurementDate = new Date(latestDate.getTime() + 7 * 24 * 60 * 60 * 1000);
            const today = new Date();
            today.setHours(0,0,0,0);
            nextMeasurementDate.setHours(0,0,0,0);
            const diffTime = nextMeasurementDate - today;
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
            if (diffDays > 0) {
                nextDateStr = `D-${diffDays}`;
            } else if (diffDays === 0) {
                nextDateStr = 'D-Day';
            } else {
                nextDateStr = `D+${Math.abs(diffDays)}`;
            }
        }

        // --- GEO Score & Confidence Interval Calculation ---
        // 최신 주간 모니터링 이력이 있으면 최우선으로 사용하여 언급률 및 CI 산출
        if (summaries && summaries.length > 0) {
            const weekSet = [...new Set(summaries.map(s => s.week))].sort();
            const latestWeek = weekSet[weekSet.length - 1];
            const latestWeekRows = summaries.filter(s => s.week === latestWeek);

            const claudeRow = latestWeekRows.find(s => s.ai_type === 'claude') || { mention_rate: 0, ci_lower: 0, ci_upper: 0, n: 0 };
            const chatgptRow = latestWeekRows.find(s => s.ai_type === 'chatgpt') || { mention_rate: 0, ci_lower: 0, ci_upper: 0, n: 0 };
            const geminiRow = latestWeekRows.find(s => s.ai_type === 'gemini') || { mention_rate: 0, ci_lower: 0, ci_upper: 0, n: 0 };

            const cRate = Number(claudeRow.mention_rate) || 0;
            const chRate = Number(chatgptRow.mention_rate) || 0;
            const gRate = Number(geminiRow.mention_rate) || 0;
            mentionRate = Math.round(cRate * 0.4 + chRate * 0.4 + gRate * 0.2);

            const cLower = Number(claudeRow.ci_lower) || 0;
            const chLower = Number(chatgptRow.ci_lower) || 0;
            const gLower = Number(geminiRow.ci_lower) || 0;
            weightedLower = Math.round(cLower * 0.4 + chLower * 0.4 + gLower * 0.2);

            const cUpper = Number(claudeRow.ci_upper) || 0;
            const chUpper = Number(chatgptRow.ci_upper) || 0;
            const gUpper = Number(geminiRow.ci_upper) || 0;
            weightedUpper = Math.round(cUpper * 0.4 + chUpper * 0.4 + gUpper * 0.2);

            totalN = (Number(claudeRow.n) || 0) + (Number(chatgptRow.n) || 0) + (Number(geminiRow.n) || 0);
        } else {
            // 모니터링 이력이 없으면 최근 진단 데이터(selfRows)로 실시간 계산 폴백
            const selfRows = latestGroup.filter(r => !r.query.includes('[경쟁사:'));
            if (selfRows.length > 0) {
                let c_mentions = 0, c_total = 0;
                let m_mentions = 0, m_total = 0;
                let g_mentions = 0, g_total = 0;

                selfRows.forEach(r => {
                    const name = r.ai_name.toLowerCase();
                    if (name.includes('claude')) {
                        c_total++;
                        if (r.mentioned) c_mentions++;
                    } else if (name.includes('chatgpt')) {
                        m_total++;
                        if (r.mentioned) m_mentions++;
                    } else if (name.includes('gemini')) {
                        g_total++;
                        if (r.mentioned) g_mentions++;
                    }
                });

                const claudeCI = calcWilsonCI(c_mentions, c_total);
                const chatgptCI = calcWilsonCI(m_mentions, m_total);
                const geminiCI = calcWilsonCI(g_mentions, g_total);

                mentionRate = Math.round(claudeCI.rate * 0.4 + chatgptCI.rate * 0.4 + geminiCI.rate * 0.2);
                weightedLower = Math.round(claudeCI.lower * 0.4 + chatgptCI.lower * 0.4 + geminiCI.lower * 0.2);
                weightedUpper = Math.round(claudeCI.upper * 0.4 + chatgptCI.upper * 0.4 + geminiCI.upper * 0.2);
                totalN = c_total + m_total + g_total;
            }
        }
        
        // Update KPI Card UI
        const kpiVis = document.getElementById('kpi-visibility-score');
        if (kpiVis) kpiVis.textContent = visibilityScore;
        
        const kpiMen = document.getElementById('kpi-mention-rate');
        if (kpiMen) kpiMen.textContent = mentionRate;

        // Render Wilson CI Badge on Home tab
        const kpiCi = document.getElementById('kpi-ci-badge');
        if (kpiCi) {
            if (totalN > 0) {
                kpiCi.innerHTML = `<span style="background: rgba(59, 109, 17, 0.08); color: #3B6D11; padding: 2.5px 7px; border-radius: 4px; font-weight: 600; font-size: 0.9em;">[${weightedLower}-${weightedUpper}]% (n=${totalN})</span>`;
            } else {
                kpiCi.textContent = '측정 대기';
            }
        }
        
        const kpiQ = document.getElementById('kpi-queries-count');
        if (kpiQ) kpiQ.textContent = queriesCount;
        
        const kpiNext = document.getElementById('kpi-next-date');
        if (kpiNext) kpiNext.textContent = nextDateStr;
        
        // Update Report Card UI
        const repVis = document.getElementById('report-visibility-score');
        if (repVis) repVis.textContent = `${visibilityScore}점`;
        
        const repMen = document.getElementById('report-mention-rate');
        if (repMen) repMen.textContent = `${mentionRate}%`;
        
        const repCnt = document.getElementById('report-content-count');
        if (repCnt) repCnt.textContent = `${contentCount}건`;
        
        const repNext = document.getElementById('report-next-date');
        if (repNext) repNext.textContent = nextDateStr;
        
        // 3. Update Charts
        // Radar Chart Data
        let radarData = [0, 0, 0, 0, 0];
        if (visibilityScore > 0) {
            radarData = [
                visibilityScore,
                Math.max(0, Math.round(visibilityScore * 0.82)),
                Math.min(100, Math.round(visibilityScore * 1.06)),
                Math.max(0, Math.round(visibilityScore * 0.7)),
                Math.max(0, Math.round(visibilityScore * 0.94))
            ];
        }
        
        // Bar Chart Data (Claude, ChatGPT, Gemini 언급률)
        let barData = [0, 0, 0];
        if (latestGroup.length > 0) {
            const selfRows = latestGroup.filter(r => !r.query.includes('[경쟁사:'));
            
            let c_mentions = 0, c_total = 0;
            let m_mentions = 0, m_total = 0; // ChatGPT
            let g_mentions = 0, g_total = 0; // Gemini
            
            selfRows.forEach(r => {
                if (r.ai_name.toLowerCase().includes('claude')) {
                    c_total++;
                    if (r.mentioned) c_mentions++;
                } else if (r.ai_name.toLowerCase().includes('chatgpt')) {
                    m_total++;
                    if (r.mentioned) m_mentions++;
                } else if (r.ai_name.toLowerCase().includes('gemini')) {
                    g_total++;
                    if (r.mentioned) g_mentions++;
                }
            });
            
            barData = [
                c_total ? Math.round((c_mentions / c_total) * 100) : 0,
                m_total ? Math.round((m_mentions / m_total) * 100) : 0,
                g_total ? Math.round((g_mentions / g_total) * 100) : 0
            ];
        }
        
        chartService.updateCharts({
            radar: radarData,
            bar: barData
        });

        // 4. Update Mini Trend Sparkline Chart
        let trendLabels = [];
        let trendDataPoints = [];

        if (summaries && summaries.length > 0) {
            const weekSet = [...new Set(summaries.map(s => s.week))].sort();
            const last8 = weekSet.slice(-8);
            trendLabels = last8.map(w => {
                const d = new Date(w + 'T00:00:00');
                return `${d.getMonth() + 1}/${d.getDate()}`;
            });
            trendDataPoints = last8.map(w => {
                const latestWeekRows = summaries.filter(s => s.week === w);
                const claudeRow = latestWeekRows.find(s => s.ai_type === 'claude') || { mention_rate: 0 };
                const chatgptRow = latestWeekRows.find(s => s.ai_type === 'chatgpt') || { mention_rate: 0 };
                const geminiRow = latestWeekRows.find(s => s.ai_type === 'gemini') || { mention_rate: 0 };
                const cRate = Number(claudeRow.mention_rate) || 0;
                const chRate = Number(chatgptRow.mention_rate) || 0;
                const gRate = Number(geminiRow.mention_rate) || 0;
                return Math.round(cRate * 0.4 + chRate * 0.4 + gRate * 0.2);
            });
        } else if (history && history.length > 0) {
            // fallback to grouping history by date
            const dateGroups = {};
            history.forEach(h => {
                if (h.query.includes('[경쟁사:')) return;
                const dateStr = h.created_at.substring(0, 10);
                if (!dateGroups[dateStr]) dateGroups[dateStr] = [];
                dateGroups[dateStr].push(h);
            });
            const sortedDates = Object.keys(dateGroups).sort().slice(-8);
            trendLabels = sortedDates.map(dStr => {
                const d = new Date(dStr + 'T00:00:00');
                return `${d.getMonth() + 1}/${d.getDate()}`;
            });
            trendDataPoints = sortedDates.map(dStr => {
                const rows = dateGroups[dStr];
                let c_mentions = 0, c_total = 0;
                let m_mentions = 0, m_total = 0;
                let g_mentions = 0, g_total = 0;
                rows.forEach(r => {
                    const name = r.ai_name.toLowerCase();
                    if (name.includes('claude')) { c_total++; if (r.mentioned) c_mentions++; }
                    else if (name.includes('chatgpt')) { m_total++; if (r.mentioned) m_mentions++; }
                    else if (name.includes('gemini')) { g_total++; if (r.mentioned) g_mentions++; }
                });
                const cRate = c_total ? (c_mentions / c_total) * 100 : 0;
                const chRate = m_total ? (m_mentions / m_total) * 100 : 0;
                const gRate = g_total ? (g_mentions / g_total) * 100 : 0;
                return Math.round(cRate * 0.4 + chRate * 0.4 + gRate * 0.2);
            });
        }

        chartService.updateMiniTrendChart(trendLabels, trendDataPoints);

    } catch (e) {
        console.error('Failed to update dashboard KPIs and charts:', e);
    }
}

// 사이드바 네비게이션
function initNavigation() {
    const menuItems = document.querySelectorAll('#sidebar-menu li, #bottom-menu li:not(.more-menu-btn), #more-menu-list li');
    const pages = document.querySelectorAll('.page');
    const pageTitle = document.getElementById('page-title');

    menuItems.forEach(item => {
        item.addEventListener('click', async () => {
            const targetId = item.getAttribute('data-target');
            if (!targetId) return;

            // 업체 설정 완료 여부 체크 (설정 탭이 아닌 다른 탭 클릭 시)
            if (targetId !== 'page-settings') {
                if (!currentStore || !currentStore.store_name) {
                    showToast('⚠️ 먼저 설정 탭에서 업체 정보를 입력해주세요.');
                    const settingsItem = Array.from(menuItems).find(m => m.getAttribute('data-target') === 'page-settings');
                    if (settingsItem) {
                        settingsItem.click();
                    }
                    return;
                }
            }

            // Update Active Menu
            menuItems.forEach(m => m.classList.remove('active'));
            // 만약 동일한 targetId를 가진 메뉴가 있다면 모두 active 처리
            menuItems.forEach(m => {
                if (m.getAttribute('data-target') === targetId) {
                    m.classList.add('active');
                }
            });

            // Update Active Page
            pages.forEach(p => p.classList.remove('active'));
            document.getElementById(targetId).classList.add('active');

            // 모바일 '더보기' 메뉴 닫기
            const moreMenu = document.getElementById('more-menu-overlay');
            if (moreMenu) moreMenu.style.display = 'none';

            // Update Title
            const titleText = item.querySelector('.label') ? item.querySelector('.label').textContent : item.textContent;
            pageTitle.textContent = titleText;
            
            // Re-render charts if dashboard is shown (fixes Chart.js resize issue)
            if (targetId === 'page-dashboard') {
                await updateDashboardData();
                updateQarelScore();
            }
            // GEO 진단 탭 진입 시 차트 강제 리사이즈 및 로드
            if (targetId === 'page-geo-diagnosis') {
                await loadCompetitorAnalysis();
                await loadLatestDiagnosisResults();
                if (window.nicheRadarChartInstance) window.nicheRadarChartInstance.resize();
                if (window.competitorCompareChartInstance) window.competitorCompareChartInstance.resize();
            }
            // 모니터링 탭 진입 시: 최신 주간 추세 로드 + 비용 경고 업데이트
            if (targetId === 'page-monitoring') {
                loadMonitoringTrend();
                updateMonitoringCostWarning();
            }
            // 채널 배포 탭 진입 시: 배포 대기 목록 로드
            if (targetId === 'page-distribution') {
                if (typeof loadDistributionQueue === 'function') {
                    await loadDistributionQueue();
                }
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

// currentStore 변수 데이터 로드
async function loadStoreData() {
    try {
        if (!currentStore) return;
        
        const storeHeaderInfo = document.getElementById('store-header-info');
        if (storeHeaderInfo) {
            storeHeaderInfo.innerHTML = `
                <strong>${currentStore.store_name || ''}</strong> | 
                ${currentStore.category || ''} | 
                ${currentStore.address || ''}
            `;
        }

        const settingsStoreInfo = document.getElementById('settings-store-info');
        if (settingsStoreInfo) {
            let hoursStr = '';
            if (currentStore.hours) {
                let parsed = currentStore.hours;
                if (typeof parsed === 'string') {
                    try { parsed = JSON.parse(parsed); } catch(e) { parsed = {}; }
                }
                if (typeof parsed === 'object') {
                    const days = [
                        { key: 'mon', label: '월' },
                        { key: 'tue', label: '화' },
                        { key: 'wed', label: '수' },
                        { key: 'thu', label: '목' },
                        { key: 'fri', label: '금' },
                        { key: 'sat', label: '토' },
                        { key: 'sun', label: '일' }
                    ];
                    
                    hoursStr = '<ul style="margin:0; padding-left:20px;">' + days.map(d => {
                        const val = parsed[d.key];
                        const text = (!val || val === '휴무') ? '휴무' : val;
                        return `<li>${d.label}: ${text}</li>`;
                    }).join('') + '</ul>';
                } else {
                    hoursStr = currentStore.hours || '';
                }
            }
            
            settingsStoreInfo.innerHTML = `
                <div style="font-weight: bold;">업체명</div><div id="info-store-name">${currentStore.store_name || ''}</div>
                <div style="font-weight: bold;">브랜드</div><div id="info-brand">${currentStore.brand || ''}</div>
                <div style="font-weight: bold;">주소</div><div id="info-address">${currentStore.address || ''}</div>
                <div style="font-weight: bold;">업종</div><div id="info-category">${currentStore.category || ''}</div>
                <div style="font-weight: bold;">컨셉</div><div id="info-concept">${currentStore.concept || ''}</div>
                <div style="font-weight: bold;">영업시간</div><div id="info-hours">${hoursStr}</div>
            `;
        }

        const settingsQueriesList = document.getElementById('settings-queries-list');
        if (settingsQueriesList) {
            let queries = currentStore.queries || [];
            if (typeof queries === 'string') {
                try { queries = JSON.parse(queries); } catch(e) { queries = []; }
            }
            settingsQueriesList.innerHTML = queries.map((q, index) => `
                <li style="margin-bottom: 5px; display: flex; justify-content: space-between;">
                    <span>${q}</span>
                    <button class="btn btn-secondary btn-delete-query" data-index="${index}" style="padding: 2px 8px; font-size: 12px; border:none; background: #e74c3c; color: white; border-radius:3px;">삭제</button>
                </li>
            `).join('');
            
            document.querySelectorAll('.btn-delete-query').forEach(btn => {
                btn.addEventListener('click', async (e) => {
                    const idx = e.target.getAttribute('data-index');
                    let currentQueries = currentStore.queries || [];
                    if (typeof currentQueries === 'string') currentQueries = JSON.parse(currentQueries);
                    currentQueries.splice(idx, 1);
                    currentStore.queries = currentQueries;
                    await loadStoreData();
                });
            });
        }
        
        // 경쟁사 목록 로드
        const settingsCompetitorsList = document.getElementById('settings-competitors-list');
        if (settingsCompetitorsList) {
            const competitors = await supabaseService.getCompetitors(currentStore.id);
            if (competitors && competitors.length > 0) {
                settingsCompetitorsList.innerHTML = competitors.map(c => {
                    const addressStr = c.address ? ` (${c.address})` : '';
                    return `
                    <li style="margin-bottom: 5px; display: flex; justify-content: space-between;">
                        <span>${c.competitor_name}${addressStr}</span>
                        <button class="btn btn-secondary btn-delete-competitor" data-id="${c.id}" style="padding: 2px 8px; font-size: 12px; border:none; background: #e74c3c; color: white; border-radius:3px;">삭제</button>
                    </li>
                    `;
                }).join('');
            } else {
                settingsCompetitorsList.innerHTML = '<li style="color: #999;">등록된 경쟁사가 없습니다.</li>';
            }
            
            document.querySelectorAll('.btn-delete-competitor').forEach(btn => {
                btn.addEventListener('click', async (e) => {
                    const id = e.target.getAttribute('data-id');
                    const success = await supabaseService.deleteCompetitor(id);
                    if (success) {
                        await loadStoreData(); // UI 리로드
                    } else {
                        alert('삭제에 실패했습니다.');
                    }
                });
            });
        }
        
        // Populate AEO Marketing fields
        const introTextarea = document.getElementById('aeo-intro-textarea');
        if (introTextarea) introTextarea.value = currentStore.introduction || '';

        const priceRangeInput = document.getElementById('aeo-price-range');
        if (priceRangeInput) priceRangeInput.value = currentStore.price_range || '';
        
        const parkingInput = document.getElementById('aeo-parking');
        if (parkingInput) parkingInput.value = currentStore.parking || '';
        
        const capacityInput = document.getElementById('aeo-capacity');
        if (capacityInput) capacityInput.value = currentStore.capacity || '';
        
        const privateRoomInput = document.getElementById('aeo-private-room');
        if (privateRoomInput) privateRoomInput.value = currentStore.private_room || '';
        
        const storyInput = document.getElementById('aeo-story');
        if (storyInput) storyInput.value = currentStore.story || '';
        
        const targetCustomersInput = document.getElementById('aeo-target-customers');
        if (targetCustomersInput) targetCustomersInput.value = currentStore.target_customers || '';
        
        const localContextInput = document.getElementById('aeo-local-context');
        if (localContextInput) localContextInput.value = currentStore.local_context || '';
        
        const eventsInput = document.getElementById('aeo-events');
        if (eventsInput) eventsInput.value = currentStore.events || '';
        
        const naverUrlInput = document.getElementById('aeo-naver-url');
        if (naverUrlInput) naverUrlInput.value = currentStore.naver_place_url || '';
        
        const naverCurrentInput = document.getElementById('aeo-naver-current');
        if (naverCurrentInput) naverCurrentInput.value = currentStore.naver_place_current || '';

        const naverOptimizedInput = document.getElementById('aeo-naver-optimized');
        if (naverOptimizedInput) naverOptimizedInput.value = currentStore.naver_place_optimized || '';
        
        const googleUrlInput = document.getElementById('aeo-google-url');
        if (googleUrlInput) googleUrlInput.value = currentStore.google_biz_url || '';
        
        const googleCurrentInput = document.getElementById('aeo-google-current');
        if (googleCurrentInput) googleCurrentInput.value = currentStore.google_biz_current || '';

        const googleOptimizedInput = document.getElementById('aeo-google-optimized');
        if (googleOptimizedInput) googleOptimizedInput.value = currentStore.google_biz_optimized || '';

        // Phase 3 리스티클 니치 드롭다운 및 목록 갱신
        updateListicleNicheSelect();
        await loadListiclesList();

        // Phase 4 배포 대기 목록 로드
        if (typeof loadDistributionQueue === 'function') {
            await loadDistributionQueue();
        }

        // 모니터링 질문 체크리스트 갱신
        if (typeof renderMonitoringQueryChecklist === 'function') {
            renderMonitoringQueryChecklist();
        }

        if (typeof renderAnalysisOptions === 'function') {
            await renderAnalysisOptions();
        }
    } catch (error) {
        console.error('Failed to load store data:', error);
    }
}


// ================================================================
// 설정 탭 — AI 자동완성 마법사 (Phase 1)
// ================================================================

/**
 * 설정 탭 마법사 초기화
 */
function initSettingsWizard() {
    const btnStart    = document.getElementById('btn-autocomplete-start');
    const btnBack     = document.getElementById('btn-wizard-back');
    const btnSaveWiz  = document.getElementById('btn-wizard-save');
    const storeInput  = document.getElementById('wizard-store-name');

    if (!btnStart) return;

    // 기존 업체가 있으면 업체명 미리 채우기
    if (currentStore && currentStore.store_name) {
        storeInput.value = currentStore.store_name;
    }

    // Enter 키로도 자동완성 트리거
    storeInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') btnStart.click();
    });

    btnStart.addEventListener('click', async () => {
        const storeName = storeInput.value.trim();
        if (!storeName) {
            storeInput.focus();
            storeInput.style.borderColor = '#e74c3c';
            setTimeout(() => storeInput.style.borderColor = '', 1500);
            return;
        }
        await runAutoComplete(storeName);
    });

    btnBack.addEventListener('click', () => {
        setWizardStep(1);
        document.getElementById('save-success-banner').classList.remove('show');
    });

    btnSaveWiz.addEventListener('click', async () => {
        await saveWizardResult();
    });
}

/**
 * 고급 설정 섹션 접기/펼치기
 */
function initAdvancedToggle() {
    const toggle = document.getElementById('settings-advanced-toggle');
    const body   = document.getElementById('settings-advanced-body');
    const arrow  = document.getElementById('settings-advanced-arrow');
    if (!toggle || !body) return;

    toggle.addEventListener('click', () => {
        const isOpen = body.classList.toggle('open');
        if (arrow) arrow.textContent = isOpen ? '▼' : '▶';
    });
}

/**
 * Step 인디케이터 업데이트
 * @param {number} step - 1 또는 2
 */
function setWizardStep(step) {
    const steps  = document.querySelectorAll('.wizard-step');
    const panels = document.querySelectorAll('.wizard-panel');

    steps.forEach(s => {
        const n = parseInt(s.dataset.step);
        s.classList.remove('active', 'done');
        if (n < step)  s.classList.add('done');
        if (n === step) s.classList.add('active');
    });

    panels.forEach(p => p.classList.remove('active'));
    const target = document.getElementById(`wizard-panel-${step}`);
    if (target) target.classList.add('active');
}

/**
 * Claude API를 통해 업체명 → 자동완성 데이터 생성
 * @param {string} storeName
 */
async function runAutoComplete(storeName) {
    const btnStart   = document.getElementById('btn-autocomplete-start');
    const loadingBox = document.getElementById('ai-loading-box');
    const loadingTxt = document.getElementById('ai-loading-text');

    // 로딩 UI 시작
    btnStart.disabled = true;
    loadingBox.classList.add('show');

    try {
        // 1단계: "ChatGPT와 Gemini가 업체 정보를 검색 중..."
        loadingTxt.textContent = "ChatGPT와 Gemini가 업체 정보를 검색 중...";
        
        const chatgptPrompt = `
경기도 가평군 조종면에 위치한 "${storeName}" 업체을 검색해서
아래 JSON 형식으로 알려줘. 모르면 빈 문자열.
{
  "address": "주소",
  "category": "업종",
  "menu": ["메뉴1", "메뉴2"],
  "hours": "영업시간",
  "features": "특징 (단체룸, 주차, 규모 등)",
  "nearby": "주변 특징 (군부대, 골프장 등)"
}
JSON만 출력.
`.trim();

        const geminiPrompt = `
경기도 가평군 조종면에 위치한 "${storeName}" 업체을 구글에서 검색해서
아래 JSON 형식으로 알려줘. 모르면 빈 문자열.
{
  "address": "주소",
  "category": "업종",
  "menu": ["메뉴1", "메뉴2"],
  "hours": "영업시간",
  "features": "특징 (단체룸, 주차, 규모 등)",
  "nearby": "주변 특징 (군부대, 골프장 등)"
}
JSON만 출력.
`.trim();

        let chatgptText = "";
        let geminiText = "";

        // ChatGPT + Gemini 병렬 호출
        try {
            const [chatgptResult, geminiResult] = await Promise.all([
                apiService.callChatGPT(chatgptPrompt).catch(err => {
                    console.warn("ChatGPT 업체 검색 실패:", err);
                    return { data: "" };
                }),
                apiService.callGemini(geminiPrompt).catch(err => {
                    console.warn("Gemini 업체 검색 실패:", err);
                    return { data: "" };
                })
            ]);
            chatgptText = chatgptResult.data || chatgptResult.content || chatgptResult.text || chatgptResult.response || "";
            geminiText = geminiResult.data || geminiResult.content || geminiResult.text || geminiResult.response || "";
        } catch (e) {
            console.warn("병렬 검색 호출 중 예외 발생:", e);
        }

        // 2단계: "수집된 정보를 분석 중..."
        loadingTxt.textContent = "수집된 정보를 분석 중...";

        function parseModelJson(responseText) {
            if (!responseText) return {};
            let jsonStr = responseText.replace(/```json\s*/gi, '').replace(/```\s*/gi, '').trim();
            const startIdx = jsonStr.indexOf('{');
            const endIdx = jsonStr.lastIndexOf('}');
            if (startIdx !== -1 && endIdx !== -1) {
                jsonStr = jsonStr.substring(startIdx, endIdx + 1);
            }
            try {
                return JSON.parse(jsonStr);
            } catch (e) {
                console.warn('Failed to parse model JSON:', e);
                return {};
            }
        }

        const chatgptInfo = parseModelJson(chatgptText);
        const geminiInfo = parseModelJson(geminiText);

        const chatgptMenu = Array.isArray(chatgptInfo.menu) ? chatgptInfo.menu : [];
        const geminiMenu = Array.isArray(geminiInfo.menu) ? geminiInfo.menu : [];

        const mergedInfo = {
            address: chatgptInfo.address || geminiInfo.address || '',
            category: chatgptInfo.category || geminiInfo.category || '',
            menu: chatgptMenu.length ? chatgptMenu : geminiMenu,
            hours: chatgptInfo.hours || geminiInfo.hours || '',
            features: chatgptInfo.features || geminiInfo.features || '',
            nearby: chatgptInfo.nearby || geminiInfo.nearby || ''
        };

        // 콘솔 로그 추가
        console.log('ChatGPT 수집 결과:', chatgptInfo);
        console.log('Gemini 수집 결과:', geminiInfo);
        console.log('병합된 업체 정보:', mergedInfo);

        // 3단계: ChatGPT(검색키워드 30개) + Gemini(AI대화형 20개) + Claude(키워드/슬러그) 병렬
        loadingTxt.textContent = "모니터링 질문 + 키워드 생성 중...";

        const mergedInfoStr = JSON.stringify(mergedInfo);

        // ── ChatGPT: 검색엔진 키워드형 30개 ──
        const chatgptQueryPrompt = `
당신은 네이버/구글 검색 키워드 전문가입니다.
아래 업체를 찾는 고객이 실제로 네이버/구글에 입력하는 검색어 형태로 30개 생성해주세요.

업체명: ${storeName}
업체 정보: ${mergedInfoStr}

아래 비율로:
① 짧은 키워드형 (2~4단어) 10개
   예: "가평 맥주집", "조종면 술집", "현리 호프"

② 중간 검색형 (5~8단어) 10개
   예: "가평 현리 단체회식 맥주집 추천"

③ 긴 검색형 (9단어 이상) 10개
   예: "가평 현리 30명 단체 회식 가능한 맥주집 어디야"

반드시 JSON 배열로만 출력하세요. 마크다운, 설명, 번호 없이 ["검색어1", "검색어2", ...] 형태만.
`.trim();

        // ── Gemini: AI 대화형 질문 20개 ──
        const geminiQueryPrompt = `
당신은 AI 검색 사용자 시뮬레이터입니다.
아래 업체를 찾는 고객이 AI(ChatGPT, Gemini, Claude)에게 자연어로 대화하듯 물어보는 질문 20개를 생성해주세요.

업체명: ${storeName}
업체 정보: ${mergedInfoStr}

예시:
- "가평 여행 코스 짜줘, 저녁에 맥주 한잔 하고 싶어"
- "맹호부대 근처에서 단체 회식할 만한 술집 추천해줘"
- "가평 당일치기인데 저녁에 시원하게 맥주 마실 곳 있어?"

반드시 JSON 배열로만 출력하세요. 마크다운, 설명, 번호 없이 ["질문1", "질문2", ...] 형태만.
`.trim();

        // ── Claude: niche_keywords + seenow_slug만 ──
        const claudePrompt = `
당신은 한국 로컬 비즈니스 GEO(Generative Engine Optimization) 전문가입니다.
아래 업체 정보와 업체명을 기반으로 다음 정보를 JSON 형식으로 생성해주세요.

업체명: ${storeName}
수집된 업체 정보: ${mergedInfoStr}

출력 형식 (JSON만, 다른 텍스트 없이):
{
  "niche_keywords": [
    "키워드1",
    "키워드2",
    "키워드3",
    "키워드4",
    "키워드5",
    "키워드6",
    "키워드7"
  ],
  "seenow_slug": "영문-소문자-슬러그"
}

규칙:
- niche_keywords: 업체명과 업체 정보를 활용하여 추출한 지역+업종+상황 조합 키워드 7개
  예: "가평 현리 단체회식", "가평 군인 회식", "경기 북부 한식", "가평 맥주집", "현리 단체룸", "가평 고기집", "맹호부대 근처 식당"
- seenow_slug: 업체명을 영문 소문자로 변환한 슬러그 (한글은 발음 영문화)
`.trim();

        // 3개 API 병렬 호출
        const [chatgptQResult, geminiQResult, claudeResult] = await Promise.all([
            apiService.callChatGPT(chatgptQueryPrompt, 1500).catch(err => {
                console.warn("ChatGPT 질문 생성 실패:", err);
                return { data: "[]" };
            }),
            apiService.callGemini(geminiQueryPrompt, 1500).catch(err => {
                console.warn("Gemini 질문 생성 실패:", err);
                return { data: "[]" };
            }),
            apiService.callClaude(claudePrompt, 1000).catch(err => {
                console.warn("Claude 키워드 생성 실패:", err);
                return { data: "{}" };
            })
        ]);

        // ── 질문 파싱 헬퍼 (JSON 배열) ──
        function parseJsonArray(responseObj) {
            const text = responseObj.data || responseObj.content || responseObj.text || responseObj.response || '[]';
            let cleaned = text.replace(/```json\s*/gi, '').replace(/```\s*/gi, '').trim();
            const startBracket = cleaned.indexOf('[');
            const endBracket   = cleaned.lastIndexOf(']');
            if (startBracket !== -1 && endBracket !== -1) {
                cleaned = cleaned.substring(startBracket, endBracket + 1);
            }
            try {
                const arr = JSON.parse(cleaned);
                return Array.isArray(arr) ? arr.filter(q => typeof q === 'string' && q.trim()) : [];
            } catch (e) {
                console.warn('질문 JSON 파싱 실패:', e, cleaned.substring(0, 200));
                return [];
            }
        }

        const chatgptQueries = parseJsonArray(chatgptQResult);
        const geminiQueries  = parseJsonArray(geminiQResult);

        console.log(`ChatGPT 검색 키워드: ${chatgptQueries.length}개`, chatgptQueries);
        console.log(`Gemini AI 대화형: ${geminiQueries.length}개`, geminiQueries);

        // 중복 제거 후 최대 50개
        const allQueries = Array.from(new Set([...chatgptQueries, ...geminiQueries])).slice(0, 50);
        console.log(`병합 후 질문 총: ${allQueries.length}개`);

        // ── Claude 응답 파싱 (niche_keywords + seenow_slug) ──
        const claudeText = claudeResult.data || claudeResult.content || claudeResult.text || claudeResult.response || '';
        let claudeJsonStr = claudeText.replace(/```json\s*/gi, '').replace(/```\s*/gi, '').trim();
        const cStart = claudeJsonStr.indexOf('{');
        const cEnd   = claudeJsonStr.lastIndexOf('}');
        if (cStart !== -1 && cEnd !== -1) {
            claudeJsonStr = claudeJsonStr.substring(cStart, cEnd + 1);
        }

        // 기본 폴백 데이터 정의
        const defaultData = {
            niche_keywords: [
                `${storeName} 단체회식`, 
                `${storeName} 맛집`, 
                `${storeName} 술집`, 
                `${storeName} 추천`, 
                `가평 ${storeName}`,
                `${storeName} 단체석`,
                `${storeName} 회식장소`
            ],
            seenow_slug: storeName.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
            monitoring_queries: allQueries.length > 0 ? allQueries : [
                `${storeName} 단체 회식 장소 추천해줘`,
                `${storeName} 맛집 알려줘`,
                `가평 현리 ${storeName} 맛 어때?`,
                `${storeName} 주차 공간 있어?`,
                `현리에서 모임하기 좋은 ${storeName} 괜찮아?`
            ]
        };

        // 잘린 JSON을 보정해주는 로컬 헬퍼 함수
        function tryRepairJson(str) {
            let repaired = str.trim();
            let openBraces = 0;
            let openBrackets = 0;
            let inString = false;
            let escape = false;
            
            for (let i = 0; i < repaired.length; i++) {
                const char = repaired[i];
                if (escape) { escape = false; continue; }
                if (char === '\\') { escape = true; continue; }
                if (char === '"') { inString = !inString; continue; }
                if (!inString) {
                    if (char === '{') openBraces++;
                    if (char === '}') openBraces--;
                    if (char === '[') openBrackets++;
                    if (char === ']') openBrackets--;
                }
            }
            
            if (inString) repaired += '"';
            while (openBrackets > 0) { repaired += ']'; openBrackets--; }
            while (openBraces > 0) { repaired += '}'; openBraces--; }
            
            try {
                return JSON.parse(repaired);
            } catch (e) {
                return null;
            }
        }

        let data;
        try {
            data = JSON.parse(claudeJsonStr);
        } catch (parseErr) {
            console.warn('Claude JSON parsing failed. Attempting to repair:', parseErr);
            const repaired = tryRepairJson(claudeJsonStr);
            if (repaired) {
                data = Object.assign({}, defaultData, repaired);
            } else {
                console.warn('JSON repair failed. Using default fallback data.');
                data = defaultData;
            }
        }

        // ChatGPT + Gemini에서 생성한 질문을 data에 병합
        data.monitoring_queries = allQueries.length > 0 ? allQueries : defaultData.monitoring_queries;

        window._wizardData = { storeName, ...data };

        renderWizardStep2(data);
        setWizardStep(2);

    } catch (err) {
        console.error('AutoComplete error:', err);
        alert(`AI 자동완성 중 오류가 발생했습니다.\n${err.message}\n\n업체명을 더 구체적으로 입력하거나 잠시 후 다시 시도해주세요.`);
    } finally {
        btnStart.disabled = false;
        loadingBox.classList.remove('show');
    }
}

/**
 * Step 2 UI 렌더링
 * @param {Object} data - Claude가 반환한 자동완성 데이터
 */
function renderWizardStep2(data) {
    // 1) 니치 키워드 칩 렌더링
    const chipsEl = document.getElementById('niche-keyword-chips');
    if (chipsEl && data.niche_keywords) {
        function renderNicheChips(keywords) {
            chipsEl.innerHTML = keywords.map((kw, i) => `
                <label class="niche-keyword-chip checked" id="chip-${i}">
                    <input type="checkbox" value="${escapeHtml(kw)}" checked>
                    <span class="chip-check">✓</span>
                    ${escapeHtml(kw)}
                </label>
            `).join('');

            // 칩 토글 이벤트
            chipsEl.querySelectorAll('.niche-keyword-chip').forEach(chip => {
                chip.addEventListener('click', () => {
                    const cb = chip.querySelector('input[type="checkbox"]');
                    cb.checked = !cb.checked;
                    chip.classList.toggle('checked', cb.checked);
                    chip.querySelector('.chip-check').textContent = cb.checked ? '✓' : '';
                });
            });
        }

        renderNicheChips(data.niche_keywords);

        // 직접 입력 기능 추가 및 이벤트 바인딩
        const btnAdd = document.getElementById('btn-add-niche-keyword');
        const inputEl = document.getElementById('niche-keyword-input');
        if (btnAdd && inputEl) {
            const newBtnAdd = btnAdd.cloneNode(true);
            btnAdd.parentNode.replaceChild(newBtnAdd, btnAdd);
            
            const addFn = () => {
                const val = inputEl.value.trim();
                if (!val) return;
                
                const existing = Array.from(chipsEl.querySelectorAll('input[type="checkbox"]')).map(cb => cb.value);
                if (existing.includes(val)) {
                    alert('이미 등록된 키워드입니다.');
                    return;
                }
                
                data.niche_keywords.push(val);
                renderNicheChips(data.niche_keywords);
                
                inputEl.value = '';
                inputEl.focus();
            };
            
            newBtnAdd.addEventListener('click', addFn);
            
            inputEl.onkeydown = (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    addFn();
                }
            };
        }
    }

    // 2) Seenow URL 슬러그
    const slugEl = document.getElementById('seenow-url-slug');
    if (slugEl && data.seenow_slug) {
        slugEl.value = data.seenow_slug;
    }



    // 4) 모니터링 질문 미리보기
    const qListEl  = document.getElementById('queries-preview-list');
    const qBadgeEl = document.getElementById('queries-count-badge');
    if (qListEl && data.monitoring_queries) {
        const qs = data.monitoring_queries;
        qListEl.innerHTML = qs.map(q => `<li>${escapeHtml(q)}</li>`).join('');
        if (qBadgeEl) qBadgeEl.textContent = `— ${qs.length}개 생성됨`;
    }
}

/**
 * Step 2 → Supabase 저장
 */
async function saveWizardResult() {
    const btnSave = document.getElementById('btn-wizard-save');
    if (!currentStore) {
        alert('저장할 업체가 선택되어 있지 않습니다. 상단 업체 선택기를 먼저 확인해주세요.');
        return;
    }

    btnSave.disabled = true;
    btnSave.textContent = '저장 중...';

    try {
        // 선택된 니치 키워드 수집
        const selectedKeywords = [];
        document.querySelectorAll('#niche-keyword-chips input[type="checkbox"]:checked').forEach(cb => {
            selectedKeywords.push(cb.value);
        });

        // Seenow 슬러그
        const slug = document.getElementById('seenow-url-slug').value.trim();

        // Supabase stores 업데이트
        const updateData = {
            niche_keywords: selectedKeywords,
            seenow_url: slug ? `seenow.kr/${slug}` : ''
        };

        // 모니터링 질문: AI 자동완성 질문은 교체, 수동 추가 질문은 유지
        const data = window._wizardData || {};
        if (data.monitoring_queries && data.monitoring_queries.length > 0) {
            // DB에 저장된 수동 추가 질문 보존
            let manualQueries = currentStore.manual_queries || [];
            if (typeof manualQueries === 'string') {
                try { manualQueries = JSON.parse(manualQueries); } catch(e) { manualQueries = []; }
            }
            const aiQueries = data.monitoring_queries;
            // 수동 질문 + AI 질문 병합 (중복 제거)
            updateData.queries = Array.from(new Set([...manualQueries, ...aiQueries]));
        }

        const res = await supabaseService.updateStore(currentStore.id, updateData);
        if (!res) throw new Error('Supabase 업데이트 실패');



        // currentStore 업데이트
        Object.assign(currentStore, updateData);

        // 저장 성공 UI
        const banner = document.getElementById('save-success-banner');
        if (banner) {
            banner.textContent = '✅ 저장 완료! GEO 진단으로 이동합니다...';
            banner.classList.add('show');
        }
        // Step 3 인디케이터
        const steps = document.querySelectorAll('.wizard-step');
        steps.forEach(s => s.classList.remove('active'));
        steps.forEach(s => s.classList.add('done'));

        await loadStoreData(); // 고급 설정 섹션 리로드

        // 1초 후 GEO 진단 탭으로 자동 이동
        setTimeout(() => {
            const diagItem = Array.from(document.querySelectorAll('#sidebar-menu li, #bottom-menu li:not(.more-menu-btn), #more-menu-list li'))
                                .find(m => m.getAttribute('data-target') === 'page-geo-diagnosis');
            if (diagItem) {
                diagItem.click();
            }
        }, 1000);

    } catch (err) {
        console.error('Wizard save error:', err);
        alert(`저장 중 오류가 발생했습니다.\n${err.message}`);
    } finally {
        btnSave.disabled = false;
        btnSave.textContent = '💾 설정 저장';
    }
}

/**
 * HTML 특수문자 이스케이프 헬퍼
 */
function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

// ================================================================
// (기존) 설정 탭 고급 수정
// ================================================================
function initSettingsEdit() {
    const btnEdit = document.getElementById('btn-edit-store-info');
    const btnSave = document.getElementById('btn-save-settings');
    const btnAddQuery = document.getElementById('btn-add-query');
    const queryInput = document.getElementById('new-query-input');
    
    let isEditing = false;
    
    if (btnEdit) {
        btnEdit.addEventListener('click', async () => {
            isEditing = !isEditing;
            const container = document.getElementById('settings-store-info');
            
            if (isEditing) {
                btnEdit.textContent = '취소';
                let h = currentStore.hours || {};
                if (typeof h === 'string') {
                    try { h = JSON.parse(h); } catch(e) { h = {}; }
                }
                const days = [
                    { key: 'mon', label: '월' },
                    { key: 'tue', label: '화' },
                    { key: 'wed', label: '수' },
                    { key: 'thu', label: '목' },
                    { key: 'fri', label: '금' },
                    { key: 'sat', label: '토' },
                    { key: 'sun', label: '일' }
                ];
                let hoursEditHtml = '<div style="grid-column: span 2;">';
                days.forEach(d => {
                    const val = h[d.key];
                    const isClosed = (!val || val === '휴무');
                    const textVal = isClosed ? '' : val;
                    const checkedStr = isClosed ? 'checked' : '';
                    const disabledStr = isClosed ? 'disabled' : '';
                    hoursEditHtml += `
                        <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 5px;">
                            <span style="width: 20px;">${d.label}</span>
                            <input type="text" id="edit-hours-${d.key}" class="form-control" style="flex: 1;" value="${textVal}" ${disabledStr}>
                            <label style="display:flex; align-items:center; gap:3px;">
                                <input type="checkbox" id="edit-closed-${d.key}" ${checkedStr} onchange="document.getElementById('edit-hours-${d.key}').disabled = this.checked"> 휴무
                            </label>
                        </div>
                    `;
                });
                hoursEditHtml += '</div>';
                
                container.innerHTML = `
                    <div style="font-weight: bold;">업체명</div><div><input type="text" id="edit-store-name" class="form-control" value="${currentStore.store_name || ''}"></div>
                    <div style="font-weight: bold;">브랜드</div><div><input type="text" id="edit-brand" class="form-control" value="${currentStore.brand || ''}"></div>
                    <div style="font-weight: bold;">주소</div><div><input type="text" id="edit-address" class="form-control" value="${currentStore.address || ''}"></div>
                    <div style="font-weight: bold;">업종</div><div><input type="text" id="edit-category" class="form-control" value="${currentStore.category || ''}"></div>
                    <div style="font-weight: bold;">컨셉</div><div><input type="text" id="edit-concept" class="form-control" value="${currentStore.concept || ''}"></div>
                    <div style="font-weight: bold; padding-top: 5px;">영업시간</div>${hoursEditHtml}
                `;
            } else {
                btnEdit.textContent = '수정';
                await loadStoreData(); // discard changes
            }
        });
    }
    
    if (btnAddQuery && queryInput) {
        // 기존 이벤트 리스너 중복 방지를 위한 클론 처리 (간단한 우회)
        const newBtnAddQuery = btnAddQuery.cloneNode(true);
        btnAddQuery.parentNode.replaceChild(newBtnAddQuery, btnAddQuery);
        
        newBtnAddQuery.addEventListener('click', async () => {
            const q = queryInput.value.trim();
            if (q && currentStore) {
                // queries에 추가
                let currentQueries = currentStore.queries || [];
                if (typeof currentQueries === 'string') currentQueries = JSON.parse(currentQueries);
                currentQueries.push(q);
                currentStore.queries = currentQueries;

                // manual_queries (DB 컬럼)에도 추가
                let manualQ = currentStore.manual_queries || [];
                if (typeof manualQ === 'string') {
                    try { manualQ = JSON.parse(manualQ); } catch(e) { manualQ = []; }
                }
                manualQ.push(q);
                currentStore.manual_queries = manualQ;

                // DB 저장 (queries + manual_queries 동시 업데이트)
                await supabaseService.updateStore(currentStore.id, {
                    queries: currentQueries,
                    manual_queries: manualQ
                });

                queryInput.value = '';
                await loadStoreData();
            }
        });
    }

    const btnAddCompetitor = document.getElementById('btn-add-competitor');
    const competitorInput = document.getElementById('new-competitor-input');
    const competitorAddressInput = document.getElementById('new-competitor-address');
    if (btnAddCompetitor && competitorInput) {
        const newBtnAddCompetitor = btnAddCompetitor.cloneNode(true);
        btnAddCompetitor.parentNode.replaceChild(newBtnAddCompetitor, btnAddCompetitor);
        
        newBtnAddCompetitor.addEventListener('click', async () => {
            const name = competitorInput.value.trim();
            const address = competitorAddressInput ? competitorAddressInput.value.trim() : '';
            if (name && currentStore) {
                const result = await supabaseService.addCompetitor(currentStore.id, name, address);
                if (result) {
                    competitorInput.value = '';
                    if (competitorAddressInput) competitorAddressInput.value = '';
                    await loadStoreData();
                } else {
                    alert('경쟁사 추가에 실패했습니다.');
                }
            }
        });
    }
    
    if (btnSave) {
        btnSave.addEventListener('click', async () => {
            if (!currentStore) return;
            
            const originalText = btnSave.textContent;
            btnSave.textContent = '저장 중...';
            btnSave.disabled = true;
            
            let updatedData = {
                queries: currentStore.queries
            };
            
            if (isEditing) {
                updatedData.store_name = document.getElementById('edit-store-name').value;
                updatedData.brand = document.getElementById('edit-brand').value;
                updatedData.address = document.getElementById('edit-address').value;
                updatedData.category = document.getElementById('edit-category').value;
                updatedData.concept = document.getElementById('edit-concept').value;
                
                const keys = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
                let newHours = {};
                keys.forEach(k => {
                    const isClosed = document.getElementById(`edit-closed-${k}`).checked;
                    newHours[k] = isClosed ? '휴무' : document.getElementById(`edit-hours-${k}`).value;
                });
                updatedData.hours = newHours;
            }
            
            try {
                const res = await supabaseService.updateStore(currentStore.id, updatedData);
                if (res) {
                    currentStore = { ...currentStore, ...updatedData };
                    alert('설정이 저장되었습니다.');
                    if (isEditing) {
                        isEditing = false;
                        btnEdit.textContent = '수정';
                    }
                    storesList = await supabaseService.getAllStores();
                    renderStoreSelector();
                    await loadStoreData();
                } else {
                    alert('저장에 실패했습니다.');
                }
            } catch (e) {
                console.error(e);
                alert('오류가 발생했습니다.');
            } finally {
                btnSave.textContent = originalText;
                btnSave.disabled = false;
            }
        });
    }

    // AEO 마케팅 정보 AI 분석 및 저장 연동
    const btnAnalyzeAeo = document.getElementById('btn-analyze-aeo');
    const btnSaveAeo = document.getElementById('btn-save-aeo-marketing');
    const aeoLoading = document.getElementById('aeo-analyze-loading');

    if (btnAnalyzeAeo) {
        btnAnalyzeAeo.addEventListener('click', async () => {
            if (!currentStore) return;
            const introText = document.getElementById('aeo-intro-textarea').value.trim();
            if (!introText) {
                alert('우리 업체를 소개하는 글을 먼저 입력해주세요.');
                return;
            }

            const originalText = btnAnalyzeAeo.textContent;
            btnAnalyzeAeo.textContent = 'AI 분석 중...';
            btnAnalyzeAeo.disabled = true;
            if (aeoLoading) aeoLoading.style.display = 'block';

            const prompt = `주어진 업체 소개글을 분석하여 다음 14개 항목에 해당하는 마케팅 정보를 JSON 형식으로 추출해주세요.
소개글에서 명시적으로 언급되지 않은 정보는 빈 문자열("")로 채워주되, naver_place_optimized와 google_biz_optimized는 아래 기준에 따라 최적화된 소개글을 새롭게 생성해 채워주세요.
중요: 답변에 부연 설명이나 마크다운 백틱 (\`\`\`json ...) 없이 오직 순수한 JSON 객체 텍스트만 출력해야 합니다. 이 텍스트는 JSON.parse()로 바로 변환이 가능해야 합니다.

추출해야 할 JSON의 키와 설명:
- price_range: 가격대 (예: 1만~2만원대)
- parking: 주차 정보 (예: 업체 앞 주차 가능)
- capacity: 수용인원 (예: 80석)
- private_room: 단체룸 (예: 30인 단체룸 보유)
- story: 핵심 스토리 (업체의 차별화 포인트를 담은 스토리)
- target_customers: 타겟 고객 (예: 군인, 가족 모임)
- local_context: 주변 맥락 (근처 군부대, 골프장, 역 등 위치 특성)
- events: 진행 중인 이벤트 (예: 군인 장병 방문 시 음료 서비스)
- naver_place_url: 네이버플레이스 URL
- naver_place_current: 네이버플레이스 현재 소개글
- naver_place_optimized: 다음 기준에 맞춰 새로 생성한 네이버플레이스 최적화 소개글:
  * 500자 이내로 작성
  * AEO 핵심 요소 포함:
    ① 구조화된 정보 (위치, 영업시간, 메뉴, 가격, 특징 등)
    ② 맥락 키워드 (지역명 + 상황 키워드)
    ③ AI가 사실(fact) 정보로 인용하기 쉬운 객관적인 문장 구조
    ④ 타겟 고객 맥락 포함
  * 감성적 미사여구를 배제하고 철저히 정보 위주로 작성
- google_biz_url: 구글 비즈니스 프로필 URL
- google_biz_current: 구글 비즈니스 프로필 현재 설명
- google_biz_optimized: 다음 기준에 맞춰 새로 생성한 구글 비즈니스 프로필 최적화 설명:
  * 750자 이내로 작성
  * 동일한 AEO 핵심 요소(구조화 정보, 맥락 키워드, AI 인용 용이성, 타겟 맥락) 포함
  * 기본적으로 한국어 중심으로 작성하되, 업체명이나 메뉴명 등 고유명사만 영문을 괄호 병기하여 작성 (예: 설맥 가평현리점 (Seolmaek Gapyeong Hyeonri), 냉면 (Naengmyeon)). 나머지는 모두 한국어로 작성

업체 소개글:
${introText}`;

            try {
                const response = await apiService.callClaude(prompt);
                let cleanJsonText = response.data.trim();
                if (cleanJsonText.startsWith('```')) {
                    cleanJsonText = cleanJsonText.replace(/^```json\s*/, '').replace(/```$/, '').trim();
                }
                const parsed = JSON.parse(cleanJsonText);

                if (parsed.price_range !== undefined) document.getElementById('aeo-price-range').value = parsed.price_range;
                if (parsed.parking !== undefined) document.getElementById('aeo-parking').value = parsed.parking;
                if (parsed.capacity !== undefined) document.getElementById('aeo-capacity').value = parsed.capacity;
                if (parsed.private_room !== undefined) document.getElementById('aeo-private-room').value = parsed.private_room;
                if (parsed.story !== undefined) document.getElementById('aeo-story').value = parsed.story;
                if (parsed.target_customers !== undefined) document.getElementById('aeo-target-customers').value = parsed.target_customers;
                if (parsed.local_context !== undefined) document.getElementById('aeo-local-context').value = parsed.local_context;
                if (parsed.events !== undefined) document.getElementById('aeo-events').value = parsed.events;
                if (parsed.naver_place_url !== undefined) document.getElementById('aeo-naver-url').value = parsed.naver_place_url;
                if (parsed.naver_place_current !== undefined) document.getElementById('aeo-naver-current').value = parsed.naver_place_current;
                if (parsed.naver_place_optimized !== undefined) document.getElementById('aeo-naver-optimized').value = parsed.naver_place_optimized;
                if (parsed.google_biz_url !== undefined) document.getElementById('aeo-google-url').value = parsed.google_biz_url;
                if (parsed.google_biz_current !== undefined) document.getElementById('aeo-google-current').value = parsed.google_biz_current;
                if (parsed.google_biz_optimized !== undefined) document.getElementById('aeo-google-optimized').value = parsed.google_biz_optimized;

                alert('AI 분석이 완료되었습니다! 상세 필드를 확인 후 저장해주세요.');
            } catch (e) {
                console.error(e);
                alert('AI 분석 중 오류가 발생했습니다: ' + e.message);
            } finally {
                btnAnalyzeAeo.textContent = originalText;
                btnAnalyzeAeo.disabled = false;
                if (aeoLoading) aeoLoading.style.display = 'none';
            }
        });
    }

    if (btnSaveAeo) {
        btnSaveAeo.addEventListener('click', async () => {
            if (!currentStore) return;

            const originalText = btnSaveAeo.textContent;
            btnSaveAeo.textContent = '저장 중...';
            btnSaveAeo.disabled = true;

            const updatedData = {
                introduction: document.getElementById('aeo-intro-textarea').value.trim(),
                price_range: document.getElementById('aeo-price-range').value.trim(),
                parking: document.getElementById('aeo-parking').value.trim(),
                capacity: document.getElementById('aeo-capacity').value.trim(),
                private_room: document.getElementById('aeo-private-room').value.trim(),
                story: document.getElementById('aeo-story').value.trim(),
                target_customers: document.getElementById('aeo-target-customers').value.trim(),
                local_context: document.getElementById('aeo-local-context').value.trim(),
                events: document.getElementById('aeo-events').value.trim(),
                naver_place_url: document.getElementById('aeo-naver-url').value.trim(),
                naver_place_current: document.getElementById('aeo-naver-current').value.trim(),
                naver_place_optimized: document.getElementById('aeo-naver-optimized').value.trim(),
                google_biz_url: document.getElementById('aeo-google-url').value.trim(),
                google_biz_current: document.getElementById('aeo-google-current').value.trim(),
                google_biz_optimized: document.getElementById('aeo-google-optimized').value.trim()
            };

            try {
                const res = await supabaseService.updateStore(currentStore.id, updatedData);
                if (res) {
                    currentStore = { ...currentStore, ...updatedData };
                    // 갱신된 업체 목록 동기화
                    const idx = storesList.findIndex(s => s.id === currentStore.id);
                    if (idx !== -1) {
                        storesList[idx] = currentStore;
                    }
                    alert('AEO 마케팅 정보가 저장되었습니다.');
                    await loadStoreData();
                } else {
                    alert('저장에 실패했습니다.');
                }
            } catch (e) {
                console.error(e);
                alert('오류가 발생했습니다.');
            } finally {
                btnSaveAeo.textContent = originalText;
                btnSaveAeo.disabled = false;
            }
        });
    }
}

function initNewStoreModal() {
    const modal = document.getElementById('new-store-modal');
    const btnClose = document.getElementById('btn-close-modal');
    const btnCancel = document.getElementById('btn-cancel-modal');
    const btnSave = document.getElementById('btn-save-new-store');
    
    const closeModal = () => {
        modal.style.display = 'none';
        const selector = document.getElementById('store-selector');
        selector.value = currentStore ? currentStore.id : '';
    };
    
    if(btnClose) btnClose.addEventListener('click', closeModal);
    if(btnCancel) btnCancel.addEventListener('click', closeModal);
    
    if(btnSave) {
        btnSave.addEventListener('click', async () => {
            const keys = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
            let newHours = {};
            keys.forEach(k => {
                const isClosed = document.getElementById(`modal-closed-${k}`).checked;
                newHours[k] = isClosed ? '휴무' : document.getElementById(`modal-hours-${k}`).value;
            });
            
            const data = {
                store_name: document.getElementById('modal-store-name').value,
                brand: document.getElementById('modal-store-brand').value,
                address: document.getElementById('modal-store-address').value,
                category: document.getElementById('modal-store-category').value,
                concept: document.getElementById('modal-store-concept').value,
                hours: newHours,
                queries: []
            };
            
            const originalText = btnSave.textContent;
            btnSave.textContent = '저장 중...';
            btnSave.disabled = true;
            
            try {
                const newStore = await supabaseService.createStore(data);
                if (newStore) {
                    alert('업체가 추가되었습니다.');
                    storesList = await supabaseService.getAllStores();
                    currentStore = newStore;
                    renderStoreSelector();
                    await refreshDashboard();
                    modal.style.display = 'none';
                    // clear modal
                    document.getElementById('modal-store-name').value = '';
                    document.getElementById('modal-store-brand').value = '';
                    document.getElementById('modal-store-address').value = '';
                    document.getElementById('modal-store-category').value = '';
                    document.getElementById('modal-store-concept').value = '';
                    keys.forEach(k => {
                        const hr = document.getElementById(`modal-hours-${k}`);
                        const chk = document.getElementById(`modal-closed-${k}`);
                        if(hr) { hr.value = ''; hr.disabled = false; }
                        if(chk) chk.checked = false;
                    });
                } else {
                    alert('업체 추가 실패');
                }
            } catch (e) {
                console.error(e);
                alert('오류 발생');
            } finally {
                btnSave.textContent = originalText;
                btnSave.disabled = false;
            }
        });
    }
}

async function renderAnalysisOptions() {
    if (!currentStore) return;
    const targetContainer = document.getElementById('target-checkboxes');
    const queryContainer = document.getElementById('query-checkboxes');
    if (!targetContainer || !queryContainer) return;
    
    // 대상 선택
    let targetsHtml = `<label style="display: flex; align-items: center; gap: 5px;"><input type="checkbox" class="target-checkbox" value="self" data-name="${currentStore.store_name || '우리 업체'}" data-address="${currentStore.address || ''}" checked> ${currentStore.store_name || '우리 업체'} (자사)</label>`;
    const competitors = await supabaseService.getCompetitors(currentStore.id) || [];
    competitors.forEach(c => {
        targetsHtml += `<label style="display: flex; align-items: center; gap: 5px;"><input type="checkbox" class="target-checkbox" value="competitor" data-name="${c.competitor_name}" data-address="${c.address || ''}" checked> ${c.competitor_name}</label>`;
    });
    targetContainer.innerHTML = targetsHtml;
    
    // 질문 선택
    let queries = currentStore.queries || [];
    if (typeof queries === 'string') {
        try { queries = JSON.parse(queries); } catch(e) { queries = []; }
    }
    if (queries.length === 0) {
        queries = ["가평 현리 단체 회식 장소 추천해줘"];
    }
    
    let queriesHtml = '';
    queries.forEach(q => {
        queriesHtml += `<label style="display: flex; align-items: center; gap: 5px;"><input type="checkbox" class="query-checkbox" value="${q}" checked> ${q}</label>`;
    });
    queryContainer.innerHTML = queriesHtml;
    
    // 이벤트 리스너 다시 부착 (새로 생성된 체크박스들)
    document.querySelectorAll('.target-checkbox, .query-checkbox').forEach(cb => {
        cb.addEventListener('change', updateExpectedApiCalls);
    });
    
    updateExpectedApiCalls();
}

function updateExpectedApiCalls() {
    const targetsCount = document.querySelectorAll('.target-checkbox:checked').length;
    const aisCount = document.querySelectorAll('.ai-checkbox:checked').length;
    const queriesCount = document.querySelectorAll('.query-checkbox:checked').length;
    
    const total = targetsCount * aisCount * queriesCount;
    const expectedEl = document.getElementById('expected-api-calls');
    const btnAnalyze = document.getElementById('btn-analyze');
    const warningEl = document.getElementById('analysis-warning');
    
    if (expectedEl) {
        expectedEl.textContent = `예상 API 호출 수: ${targetsCount} × ${queriesCount} × ${aisCount} = ${total}회`;
    }
    
    if (total === 0) {
        if (btnAnalyze) btnAnalyze.disabled = true;
        if (warningEl) warningEl.style.display = 'block';
    } else {
        if (btnAnalyze) btnAnalyze.disabled = false;
        if (warningEl) warningEl.style.display = 'none';
    }
}

// 진단 분석 실행
function initAnalysis() {
    const btnAnalyze = document.getElementById('btn-analyze');
    const analysisResults = document.getElementById('analysis-results');
    const analysisProgress = document.getElementById('analysis-progress');
    const progressBar = document.getElementById('progress-bar');
    const progressText = document.getElementById('progress-text');

    // 토글 버튼 및 AI 체크박스 이벤트 바인딩
    document.querySelectorAll('.ai-checkbox').forEach(cb => {
        cb.addEventListener('change', updateExpectedApiCalls);
    });

    document.getElementById('btn-toggle-targets')?.addEventListener('click', (e) => {
        const checkboxes = Array.from(document.querySelectorAll('.target-checkbox'));
        const isAllChecked = checkboxes.every(cb => cb.checked);
        checkboxes.forEach(cb => cb.checked = !isAllChecked);
        e.target.textContent = isAllChecked ? '전체 선택' : '전체 해제';
        updateExpectedApiCalls();
    });
    
    document.getElementById('btn-toggle-ais')?.addEventListener('click', (e) => {
        const checkboxes = Array.from(document.querySelectorAll('.ai-checkbox'));
        const isAllChecked = checkboxes.every(cb => cb.checked);
        checkboxes.forEach(cb => cb.checked = !isAllChecked);
        e.target.textContent = isAllChecked ? '전체 선택' : '전체 해제';
        updateExpectedApiCalls();
    });
    
    document.getElementById('btn-toggle-queries')?.addEventListener('click', (e) => {
        const checkboxes = Array.from(document.querySelectorAll('.query-checkbox'));
        const isAllChecked = checkboxes.every(cb => cb.checked);
        checkboxes.forEach(cb => cb.checked = !isAllChecked);
        e.target.textContent = isAllChecked ? '전체 선택' : '전체 해제';
        updateExpectedApiCalls();
    });

    // 질문 추가 로직
    document.getElementById('btn-analysis-add-query')?.addEventListener('click', async () => {
        const input = document.getElementById('analysis-new-query');
        const q = input.value.trim();
        if (q && currentStore) {
            let currentQueries = currentStore.queries || [];
            if (typeof currentQueries === 'string') currentQueries = JSON.parse(currentQueries);
            currentQueries.push(q);
            currentStore.queries = currentQueries;
            
            // DB 업데이트
            await supabaseService.updateStore(currentStore.id, { queries: currentStore.queries });
            
            input.value = '';
            await loadStoreData(); // UI 갱신 (renderAnalysisOptions 포함)
        }
    });

    if (!btnAnalyze) return;

    btnAnalyze.addEventListener('click', async () => {
        const isMonitoringMode = document.querySelector('input[name="analysis-mode"]:checked')?.value === 'monitoring';
        
        // 타겟 설정
        const targets = [];
        document.querySelectorAll('.target-checkbox:checked').forEach(cb => {
            targets.push({
                isCompetitor: cb.value === 'competitor',
                name: cb.getAttribute('data-name'),
                address: cb.getAttribute('data-address')
            });
        });
        
        // 질문 설정
        const queries = [];
        document.querySelectorAll('.query-checkbox:checked').forEach(cb => {
            queries.push(cb.value);
        });
        
        // AI 설정
        const selectedAIs = Array.from(document.querySelectorAll('.ai-checkbox:checked')).map(cb => cb.value);

        if (targets.length === 0 || queries.length === 0 || selectedAIs.length === 0) {
            alert('대상, AI, 질문을 각각 1개 이상 선택해주세요.');
            return;
        }

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

            const now = new Date().toISOString();
            const tasks = [];
            
            function delay(ms) {
                return new Promise(resolve => setTimeout(resolve, ms));
            }
            let geminiDelayMs = 0;

            // 선택된 타겟 x 질문 조합에 대해 API 호출
            for (const target of targets) {
                for (const q of queries) {
                    let prompt = q;
                    if (isMonitoringMode) {
                        prompt = q;
                    } else {
                        if (target.isCompetitor) {
                            const addrInfo = target.address ? `, 위치: ${target.address}` : '';
                            prompt = `경쟁 업체 정보: ${target.name}${addrInfo}\n질문: ${q}`;
                        } else {
                            const addrInfo = target.address ? `, 위치: ${target.address}` : '';
                            prompt = `우리 업체 정보: ${target.name}${addrInfo}\n질문: ${q}`;
                        }
                    }

                    console.log('📤 전송 프롬프트:', prompt);
                    console.log('🔧 모드:', isMonitoringMode ? '모니터링' : '콘텐츠생성');
                    
                    const queryLog = target.isCompetitor ? `[경쟁사:${target.name}] ${q}` : q;
                    
                    tasks.push((async () => {
                        const promises = [];
                        
                        if (selectedAIs.includes('Claude')) {
                            promises.push(apiService.callClaude(prompt).then(res => ({ai_name: 'Claude', res})));
                        }
                        if (selectedAIs.includes('ChatGPT')) {
                            promises.push(apiService.callChatGPT(prompt).then(res => ({ai_name: 'ChatGPT', res})));
                        }
                        if (selectedAIs.includes('Gemini')) {
                            const currentGeminiDelay = geminiDelayMs;
                            geminiDelayMs += 2000;
                            promises.push(delay(currentGeminiDelay).then(() => apiService.callGemini(prompt)).then(res => ({ai_name: 'Gemini', res})));
                        }
                        
                        const aiResponses = await Promise.all(promises);
                        
                        return aiResponses.map(item => {
                            const responseText = item.res.data || '';
                            const mentioned = responseText.includes(target.name);
                            let score = 0;
                            if (mentioned) {
                                const nameCount = (responseText.match(new RegExp(target.name, 'g')) || []).length;
                                score += Math.min(nameCount * 20, 60);  // 언급 횟수 (최대 60점)
                                if (target.address && responseText.includes(target.address.substring(0, 10))) score += 20;  // 주소 포함 시 +20
                                if (responseText.length > 200) score += 20;  // 상세 답변 시 +20
                            }
                            return {
                                ai_name: item.ai_name,
                                query: queryLog,
                                response: responseText,
                                mentioned: mentioned,
                                score: score
                            };
                        });
                    })());
                }
            }

            const allResults = await Promise.all(tasks);
            const flatResults = allResults.flat();
            console.log("Analysis Results Payload:", flatResults);

            clearInterval(progressInterval);
            progressBar.style.width = '100%';
            progressText.textContent = '100% 완료';

            // Supabase에 분석 결과 자동 저장
            if(currentStore && flatResults.length > 0) {
                const insertPayload = flatResults.map(r => ({
                    store_id: currentStore.id,
                    ai_name: r.ai_name,
                    query: r.query,
                    response: r.response,
                    mentioned: r.mentioned,
                    score: r.score,
                    mode: isMonitoringMode ? 'monitoring' : 'content',
                    created_at: now
                }));
                await supabaseService.saveAnalysisResult(insertPayload);
            }
            
            // UI에는 자사의 첫 번째 질문 결과만 대표로 표시
            setTimeout(() => {
                analysisProgress.style.display = 'none';
                
                // 수정 C: 차트 컨테이너 표시 후 차트 초기화/리사이즈
                document.getElementById('analysis-results').style.display = 'block';
                if (window.nicheRadarChartInstance) window.nicheRadarChartInstance.resize();
                if (window.competitorCompareChartInstance) window.competitorCompareChartInstance.resize();
                
                if (flatResults.length > 0) {
                    const claudeFirst = flatResults.find(r => r.ai_name === 'Claude');
                    const chatgptFirst = flatResults.find(r => r.ai_name === 'ChatGPT');
                    const geminiFirst = flatResults.find(r => r.ai_name === 'Gemini');

                    const claudeEl = document.getElementById('claude-response');
                    if (claudeFirst && claudeEl) {
                        claudeEl.parentElement.style.display = 'block';
                        claudeEl.textContent = claudeFirst.response;
                    } else if (claudeEl) {
                        claudeEl.parentElement.style.display = 'none';
                    }

                    const chatgptEl = document.getElementById('chatgpt-response');
                    if (chatgptFirst && chatgptEl) {
                        chatgptEl.parentElement.style.display = 'block';
                        chatgptEl.textContent = chatgptFirst.response;
                    } else if (chatgptEl) {
                        chatgptEl.parentElement.style.display = 'none';
                    }

                    const geminiEl = document.getElementById('gemini-response');
                    if (geminiFirst && geminiEl) {
                        geminiEl.parentElement.style.display = 'block';
                        geminiEl.textContent = geminiFirst.response;
                    } else if (geminiEl) {
                        geminiEl.parentElement.style.display = 'none';
                    }
                    
                    let summary = "[진단 요약]\n";
                    if (claudeFirst) summary += `Claude: ${claudeFirst.response}\n`;
                    if (chatgptFirst) summary += `ChatGPT: ${chatgptFirst.response}\n`;
                    if (geminiFirst) summary += `Gemini: ${geminiFirst.response}\n`;
                    summary += `\n[추천 액션]\n1. 관련 포스팅 강화\n2. 정보 업데이트 최신화`;
                    
                    const prescriptionEl = document.getElementById('ai-prescription-text');
                    if (prescriptionEl) prescriptionEl.value = summary;

                    // Phase 5: 실시간 차트/테이블 및 홈 탭 대시보드 갱신
                    // 수정 D: 분석 완료 후 즉시 차트 강제 갱신
                    (async () => {
                        await loadCompetitorAnalysis();
                        if (window.nicheRadarChartInstance) window.nicheRadarChartInstance.update();
                        if (window.competitorCompareChartInstance) window.competitorCompareChartInstance.update();
                    })();
                    loadLatestDiagnosisResults();
                    updateDashboardData();
                }
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


// ================================================================
// Phase 3 — 콘텐츠 생성 (제3자 리스티클 중심)
// ================================================================

/**
 * 리스티클 콘텐츠 생성 탭 초기화
 */
function initContentGeneration() {
    const nicheSelect = document.getElementById('listicle-niche-select');
    const btnSuggest  = document.getElementById('btn-suggest-titles');
    const btnGenerate = document.getElementById('btn-generate-listicle');
    const suggestList = document.getElementById('title-suggestions-container');
    const loadingBox  = document.getElementById('listicle-loading-box');
    const loadingText = document.getElementById('listicle-loading-text');

    if (!nicheSelect || !btnSuggest || !btnGenerate) return;

    // 1. 니치 키워드 드롭다운 변경 이벤트
    nicheSelect.addEventListener('change', () => {
        suggestList.style.display = 'none';
        suggestList.innerHTML = '';
        btnGenerate.disabled = true;
    });

    // 2. 제목 추천받기 버튼 클릭 이벤트
    btnSuggest.addEventListener('click', async () => {
        const nicheKeyword = nicheSelect.value;
        if (!nicheKeyword) {
            alert('타겟 니치 키워드를 선택해주세요.');
            nicheSelect.focus();
            return;
        }

        btnSuggest.disabled = true;
        loadingBox.style.display = 'flex';
        loadingText.textContent = `"${nicheKeyword}" 타겟으로 기사 제목 추천 후보를 생성 중입니다...`;
        suggestList.style.display = 'none';

        try {
            const prompt = `당신은 JSON 변환기입니다. 아래 니치 키워드에 맞춰 큐레이션 기사(리스티클) 제목 5개를 생성하세요.
니치 키워드: "${nicheKeyword}"

반드시 마크다운, 표, 인사말, 설명 없이 순수 JSON 문자열 배열만 반환하세요.
예시:
["가평 현리 단체회식 추천 5선", "가평 현리 가성비 술집 모음", "맹호부대 부모님 회식 장소 BEST 5", "가평 조종면 모임하기 좋은 술집", "가평 현리 얼음맥주 맛집 큐레이션"]`;
            const result = await apiService.callClaude(prompt);
            const text = result.data || result.content || result.text || result.response || '';
            
            let jsonStr = text.replace(/```json\s*/gi, '').replace(/```\s*/gi, '').trim();
            const start = jsonStr.indexOf('[');
            const end   = jsonStr.lastIndexOf(']');
            if (start !== -1 && end !== -1) {
                jsonStr = jsonStr.substring(start, end + 1);
            }
            let titles = [];
            try {
                titles = JSON.parse(jsonStr);
            } catch(e) {
                // 파싱 실패 시 텍스트에서 볼드/라인 추출  fallback
                const lines = text.split('\n').map(l => l.replace(/^[*\s\d.#|-]+/, '').replace(/\*\*/g, '').trim()).filter(l => l.length > 5);
                titles = lines.slice(0, 5);
            }

            if (Array.isArray(titles) && titles.length > 0) {
                suggestList.innerHTML = titles.slice(0, 5).map((title, index) => `
                    <label class="title-suggestion-item" for="title-radio-${index}">
                        <input type="radio" name="listicle-title-option" id="title-radio-${index}" value="${escapeHtml(title)}">
                        <span>${escapeHtml(title)}</span>
                    </label>
                `).join('');
                
                // 라디오 클릭 시 본문 생성 버튼 활성화
                suggestList.querySelectorAll('input[name="listicle-title-option"]').forEach(radio => {
                    radio.addEventListener('change', () => {
                        btnGenerate.disabled = false;
                    });
                });

                suggestList.style.display = 'flex';
            } else {
                throw new Error('제목 추천 형식이 맞지 않습니다.');
            }
        } catch (err) {
            console.error('Suggest title error:', err);
            alert('제목 추천을 가져오는 도중 오류가 발생했습니다. 다시 시도해주세요.');
        } finally {
            btnSuggest.disabled = false;
            loadingBox.style.display = 'none';
        }
    });

    // 3. 본문 생성하기 버튼 클릭 이벤트
    btnGenerate.addEventListener('click', async () => {
        const nicheKeyword = nicheSelect.value;
        const selectedTitle = document.querySelector('input[name="listicle-title-option"]:checked')?.value;
        if (!nicheKeyword || !selectedTitle) {
            alert('니치 키워드와 기사 제목을 모두 확정해주세요.');
            return;
        }

        btnGenerate.disabled = true;
        btnSuggest.disabled = true;
        nicheSelect.disabled = true;
        loadingBox.style.display = 'flex';
        loadingText.textContent = '선택하신 제목을 토대로 4대 증거유닛과 객관성 검증을 거친 리스티클 기사를 작성하고 있습니다...';

        try {
            await generateListicle(selectedTitle, nicheKeyword);
            alert('기사가 성공적으로 생성되어 초안으로 보관되었습니다.');
            
            // 폼 초기화
            suggestList.style.display = 'none';
            suggestList.innerHTML = '';
            btnGenerate.disabled = true;
        } catch (err) {
            console.error('Generate listicle error:', err);
            alert('본문 기사 생성 도중 오류가 발생했습니다: ' + err.message);
        } finally {
            btnGenerate.disabled = false;
            btnSuggest.disabled = false;
            nicheSelect.disabled = false;
            loadingBox.style.display = 'none';
        }
    });
}

/**
 * 니치 키워드 드롭다운 리스트 갱신
 */
function updateListicleNicheSelect() {
    const nicheSelect = document.getElementById('listicle-niche-select');
    if (!nicheSelect) return;

    if (!currentStore) {
        nicheSelect.innerHTML = '<option value="">-- 업체를 먼저 선택해주세요 --</option>';
        return;
    }

    let niches = currentStore.niche_keywords || [];
    if (typeof niches === 'string') {
        try { niches = JSON.parse(niches); } catch(e) { niches = []; }
    }

    if (niches.length > 0) {
        nicheSelect.innerHTML = `<option value="">-- 니치 키워드를 선택하세요 (총 ${niches.length}개) --</option>` +
            niches.map(n => `<option value="${escapeHtml(n)}">${escapeHtml(n)}</option>`).join('');
    } else {
        nicheSelect.innerHTML = '<option value="">-- [주의] 설정 마법사에서 니치 키워드를 먼저 생성해주세요 --</option>';
    }
}

/**
 * 리스티클 본문 기사 생성 및 데이터베이스 저장
 * @param {string} title 기사 제목
 * @param {string} nicheKeyword 니치 키워드
 */
async function generateListicle(title, nicheKeyword) {
    if (!currentStore) return;

    const storeName = currentStore.store_name || '';
    const category = currentStore.category || '';
    const address = currentStore.address || '';
    const concept = currentStore.concept || '';
    const priceRange = currentStore.price_range || '';
    const parking = currentStore.parking || '';
    const capacity = currentStore.capacity || '';
    const privateRoom = currentStore.private_room || '';
    const story = currentStore.story || '';

    const systemPrompt = `당신은 지역 맛집과 숨겨진 명소를 냉철하고 통찰력 있게 큐레이션하는 권위 있는 지역 전문 매거진 기자입니다.
절대 노골적인 단일 업체 홍보글이 아니며, 독자들에게 정보를 제공하는 객관적인 큐레이션 기사 형태로 작성되어야 합니다.

기사 작성 정보:
- 대상 니치 검색 키워드: ${nicheKeyword}
- 매칭 기사 제목: ${title}
- 우리 업체 정보: 명칭: ${storeName}, 업종: ${category}, 주소: ${address}, 특징/컨셉: ${concept}, 가격대: ${priceRange}, 주차: ${parking}, 좌석: ${capacity}, 독립룸: ${privateRoom}, 업체스토리: ${story}

[기사 작성 가이드라인]
1. 제3자 객관적 관점:
   - 기사는 추천 가이드 형태이어야 하며 반드시 타 업체 후보군들도 함께 큐레이션(비교 기술) 하세요.
   - 단, 우리 업체(${storeName})을 전체 리스티클에서 가장 추천도가 높은 주요 업체로 강조해 배치하되, 객관성과 매체 신뢰도를 높이기 위해 우리 업체(${storeName})에 대한 사소한 아쉬운 점이나 단점도 1가지 이상 유의미하게 솔직히 서술해야 합니다. (예: 인기가 많아 식사 피크 타임 대기가 있다거나 골목 안쪽에 위치해 처음 찾기 헷갈린다 등)

2. 4대 증거유닛(Evidence Units) 의무 포함:
   기사 본문 내용에 다음 4대 증거가 독자에게 객관적 사실로 전달될 수 있도록 자연스럽게 작성해야 합니다.
   ① 수치/통계 (Statistics): 반드시 아래 업체 정보에서 확인된 수치만 사용할 것. 확인되지 않은 평점, 리뷰 수 등은 절대 임의로 생성하지 말 것. 사용 가능한 수치: 수용인원, 단체룸 규모, 영업시간, 가격대 등 업체 정보에 명시된 것만. (예: "단체 30인룸 보유", "매일 17시~익일 1시 영업" 등)
   ② 인용구 (Quotes): 실제 방문 고객이나 관계자의 구체적 한줄 평 (예: "~라는 평을 받는다")
   ③ 출처 (Sources): 통계의 기반 출처 명시 (예: "가평군 통계자료에 따르면" 또는 "네이버 방문자리뷰 분석 결과")
   ④ 비교 설명 (Comparison): 인근 경쟁 업체 등 대비 우리 업체의 강력한 차별점 (예: "인근 B식당과 달리 단독 룸이 있어 방해받지 않는다")

[출력 포맷 가이드라인]
반드시 아래의 단순 JSON 객체 구조로만 출력하고, 마크다운 코드블록 외의 일체의 대화식이나 안내 인삿말은 제외해주세요:
{
  "body": "기사 본문 전체 마크다운 내용",
  "evidence_units": {
    "statistics": "본문에 삽입된 수치/통계 문장",
    "quote": "본문에 삽입된 인용구 문장",
    "source": "본문에 삽입된 출처 문장",
    "comparison": "본문에 삽입된 비교 설명 문장"
  }
}`;

    const response = await apiService.callClaude(systemPrompt);
    const content = response.data || response.content || response.text || response.response || '';

    // JSON 파싱
    let jsonStr = content.replace(/```json\s*/gi, '').replace(/```\s*/gi, '').trim();
    const start = jsonStr.indexOf('{');
    const end   = jsonStr.lastIndexOf('}');
    if (start !== -1 && end !== -1) {
        jsonStr = jsonStr.substring(start, end + 1);
    }
    const data = JSON.parse(jsonStr);

    const previewText = data.body.substring(0, 80) + (data.body.length > 80 ? '...' : '');

    // Supabase contents 저장
    const insertPayload = {
        store_id: currentStore.id,
        type: '제3자 리스티클 기사',
        title: title,
        body: data.body,
        preview: previewText,
        status: 'draft',
        content_type: 'listicle',
        evidence_units: data.evidence_units,
        niche_keyword: nicheKeyword,
        created_at: new Date().toISOString()
    };

    const result = await supabaseService.saveContent(insertPayload);
    if (result && result.length > 0) {
        const contentId = result[0].id;
        const channels = ['naver_blog', 'instagram', 'seenow', 'google_business'];
        for (const chan of channels) {
            await supabaseService.saveDistributionItem({
                store_id: currentStore.id,
                content_id: contentId,
                channel: chan,
                status: '대기',
                created_at: new Date().toISOString()
            });
        }
    }
    await loadListiclesList();
}

/**
 * 리스티클 생성된 목록 데이터 로드 및 테이블 렌더링
 */
async function loadListiclesList() {
    const tableBody = document.getElementById('listicle-table-body');
    if (!tableBody) return;

    if (!currentStore) {
        tableBody.innerHTML = '<tr><td colspan="5" style="text-align: center; padding: 25px; color: #999;">업체를 먼저 선택해주세요.</td></tr>';
        return;
    }

    try {
        const contents = await supabaseService.getContents(currentStore.id);
        const listicles = contents.filter(c => c.content_type === 'listicle' || c.type === '제3자 리스티클 기사');

        if (listicles.length > 0) {
            tableBody.innerHTML = listicles.map(c => {
                const dateStr = new Date(c.created_at).toLocaleDateString('ko-KR');
                const statusBadge = c.status === 'published' 
                    ? '<span style="color: #27ae60; font-weight: bold;">발행 완료</span>' 
                    : '<span style="color: #f39c12; font-weight: bold;">초안</span>';

                // 증거유닛 데이터 임베딩을 위해 dataset 보관
                const evDataStr = encodeURIComponent(JSON.stringify(c.evidence_units || {}));
                
                return `
                    <tr>
                        <td>${dateStr}</td>
                        <td style="font-weight: 600; text-align: left;">${escapeHtml(c.title)}</td>
                        <td><span class="ci-badge" style="font-size: 0.8rem;">${escapeHtml(c.niche_keyword || '없음')}</span></td>
                        <td>${statusBadge}</td>
                        <td>
                            <button class="btn btn-secondary btn-view-content" 
                                    style="padding: 4px 8px; font-size: 11px;" 
                                    data-body="${encodeURIComponent(c.body)}"
                                    data-title="${escapeHtml(c.title)}"
                                    data-date="${dateStr}"
                                    data-evidence="${evDataStr}">보기</button>
                        </td>
                    </tr>
                `;
            }).join('');
        } else {
            tableBody.innerHTML = '<tr><td colspan="5" style="text-align: center; padding: 25px; color: #999;">생성된 리스티클 콘텐츠가 없습니다. 니치 키워드를 선택해 첫 리스티클 기사를 발행해보세요!</td></tr>';
        }
    } catch (e) {
        console.error('Failed to load listicles list:', e);
        tableBody.innerHTML = '<tr><td colspan="5" style="text-align: center; padding: 25px; color: red;">목록을 불러오는 중 오류가 발생했습니다.</td></tr>';
    }
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
        if(!currentStore) return;
        const history = await supabaseService.getAnalysisHistory(currentStore.id);
        if (history && history.length > 0) {
            const grouped = {};
            history.forEach(row => {
                const key = row.created_at;
                if (!grouped[key]) {
                    grouped[key] = { rows: [], dateStr: new Date(key).toLocaleString() };
                }
                grouped[key].rows.push(row);
            });

            const sortedKeys = Object.keys(grouped).sort((a, b) => new Date(b) - new Date(a));
            
            tableBody.innerHTML = sortedKeys.map(key => {
                const group = grouped[key];
                const totalRows = group.rows.length;
                let totalScore = 0;
                let mentionedCount = 0;
                
                group.rows.forEach(r => {
                    totalScore += Number(r.score) || 0;
                    if (r.mentioned) mentionedCount++;
                });
                
                const avgScore = totalRows ? Math.round(totalScore / totalRows) : 0;
                const mentionRate = totalRows ? Math.round((mentionedCount / totalRows) * 100) : 0;
                
                return `
                    <tr>
                        <td>${group.dateStr}</td>
                        <td>${avgScore}</td>
                        <td>${mentionRate}%</td>
                        <td>분석 완료</td>
                    </tr>
                `;
            }).join('');
        } else {
            tableBody.innerHTML = `<tr><td colspan="4" style="text-align: center; padding: 20px;">분석 이력이 없습니다.</td></tr>`;
        }
    } catch (error) {
        console.error('Failed to load history:', error);
    }
}

async function loadCompetitorAnalysis() {
    console.log('🔍 loadCompetitorAnalysis 호출됨');
    const tableBody = document.getElementById('competitor-table-body');
    // tableBody 없어도 계속 진행
    try {
        if (!currentStore) return;
        
        // competitors를 직접 조회
        const competitors = await supabaseService.getCompetitors(currentStore.id) || [];
        console.log('competitors:', competitors.length);

        if (competitors.length === 0) {
            if (tableBody) {
                tableBody.innerHTML = `<tr><td colspan="5" style="text-align: center; padding: 20px;">설정 페이지에서 경쟁사를 등록해주세요</td></tr>`;
            }
            // 차트는 비워두되 함수는 계속 진행
        }

        // 수정 D: loadCompetitorAnalysis() mode 필터 제거
        const history = await supabaseService.getAnalysisHistory(currentStore.id, 'monitoring');
        console.log('history:', history?.length);

        if (!history || history.length === 0) {
            if (tableBody) {
                tableBody.innerHTML = `<tr><td colspan="5" style="text-align: center; padding: 20px;">분석을 실행해주세요</td></tr>`;
            }
            return;
        }

        // 시간 무관, 가장 최근 분석 배치 기준
        const latestTime = history[0]?.created_at;
        // 날짜 비교 시 초 단위로 반올림해서 비교
        const latestSec = latestTime ? latestTime.substring(0, 19) : null;
        const recentRows = latestSec
            ? history.filter(r => r.created_at.substring(0, 19) === latestSec)
            : [];
        console.log('latestSec:', latestSec);
        console.log('recentRows:', recentRows.length);

        const targets = [
            { isCompetitor: false, name: currentStore.store_name || '우리 업체' },
            ...competitors.map(c => ({ isCompetitor: true, name: c.competitor_name }))
        ];

        let html = '';
        targets.forEach(target => {
            // 필터링
            const targetRows = recentRows.filter(r => {
                if (target.isCompetitor) {
                    return r.query.includes(`[경쟁사:${target.name}]`);
                } else {
                    return !r.query.includes(`[경쟁사:`);
                }
            });

            if (targetRows.length > 0) {
                let totalScore = 0;
                let c_mentions = 0, c_total = 0;
                let g_mentions = 0, g_total = 0;
                let m_mentions = 0, m_total = 0; // m for chatgpt

                targetRows.forEach(r => {
                    totalScore += Number(r.score) || 0;
                    if (r.ai_name.toLowerCase().includes('claude')) {
                        c_total++;
                        if (r.mentioned) c_mentions++;
                    } else if (r.ai_name.toLowerCase().includes('chatgpt')) {
                        m_total++;
                        if (r.mentioned) m_mentions++;
                    } else if (r.ai_name.toLowerCase().includes('gemini')) {
                        g_total++;
                        if (r.mentioned) g_mentions++;
                    }
                });

                const avgScore = Math.round(totalScore / targetRows.length);
                const claudeRate = c_total ? Math.round((c_mentions / c_total) * 100) : 0;
                const chatgptRate = m_total ? Math.round((m_mentions / m_total) * 100) : 0;
                const geminiRate = g_total ? Math.round((g_mentions / g_total) * 100) : 0;

                const displayName = target.isCompetitor ? target.name : `${target.name} (자사)`;

                html += `
                    <tr>
                        <td>${displayName}</td>
                        <td>${avgScore}</td>
                        <td>${claudeRate}%</td>
                        <td>${chatgptRate}%</td>
                        <td>${geminiRate}%</td>
                    </tr>
                `;
            } else {
                const displayName = target.isCompetitor ? target.name : `${target.name} (자사)`;
                html += `
                    <tr>
                        <td>${displayName}</td>
                        <td colspan="4" style="color:#999; text-align:center;">분석 데이터 없음</td>
                    </tr>
                `;
            }
        });

        if (tableBody) {
            tableBody.innerHTML = html;
        }

        // GEO진단 차트 업데이트 실행
        updateGeoDiagnosisCharts(recentRows, competitors);

    } catch (error) {
        console.error('Failed to load competitor analysis:', error);
        if (tableBody) {
            tableBody.innerHTML = `<tr><td colspan="5" style="text-align: center; color: red;">데이터를 불러오는 중 오류가 발생했습니다.</td></tr>`;
        }
    }
}

/**
 * GEO 진단 탭 차트 업데이트
 */
function updateGeoDiagnosisCharts(recentRows, competitors) {
    if (!recentRows || recentRows.length === 0) return;

    // 1. 니치 키워드 적합도 분석 레이더 차트
    const selfRows = recentRows.filter(r => !r.query.includes('[경쟁사:'));
    const uniqueQueries = [...new Set(selfRows.map(r => r.query))];
    
    // 수정 C: 레이더 차트 라벨 최대 5개로 제한
    const topQueries = uniqueQueries.slice(0, 5);
    
    const nicheScores = topQueries.map(q => {
        const qRows = selfRows.filter(r => r.query === q);
        let c_mentions = 0, c_total = 0;
        let m_mentions = 0, m_total = 0;
        let g_mentions = 0, g_total = 0;
        
        qRows.forEach(r => {
            const name = r.ai_name.toLowerCase();
            if (name.includes('claude')) { c_total++; if (r.mentioned) c_mentions++; }
            else if (name.includes('chatgpt')) { m_total++; if (r.mentioned) m_mentions++; }
            else if (name.includes('gemini')) { g_total++; if (r.mentioned) g_mentions++; }
        });
        
        const cRate = c_total ? (c_mentions / c_total) * 100 : 0;
        const chRate = m_total ? (m_mentions / m_total) * 100 : 0;
        const gRate = g_total ? (g_mentions / g_total) * 100 : 0;
        
        // GEO Score 가중 언급률 산출
        return Math.round(cRate * 0.4 + chRate * 0.4 + gRate * 0.2);
    });
    
    chartService.updateNicheRadarChart(topQueries, nicheScores);

    // 2. 경쟁사 대비 AI 언급률 비교 막대 차트
    const datasets = [];
    
    // 자사 데이터셋 추가
    const selfClaude = selfRows.filter(r => r.ai_name.toLowerCase().includes('claude'));
    const selfChatgpt = selfRows.filter(r => r.ai_name.toLowerCase().includes('chatgpt'));
    const selfGemini = selfRows.filter(r => r.ai_name.toLowerCase().includes('gemini'));
    
    const selfData = [
        selfClaude.length ? Math.round(selfClaude.filter(r => r.mentioned).length / selfClaude.length * 100) : 0,
        selfChatgpt.length ? Math.round(selfChatgpt.filter(r => r.mentioned).length / selfChatgpt.length * 100) : 0,
        selfGemini.length ? Math.round(selfGemini.filter(r => r.mentioned).length / selfGemini.length * 100) : 0
    ];
    
    datasets.push({
        label: (currentStore?.store_name || '자사') + ' (자사)',
        data: selfData,
        backgroundColor: 'rgba(24, 95, 165, 0.85)',
        borderColor: 'rgba(24, 95, 165, 1)',
        borderWidth: 1
    });

    // 경쟁사 데이터셋 추가
    const colors = ['rgba(74, 85, 104, 0.7)', 'rgba(113, 128, 150, 0.7)', 'rgba(160, 174, 192, 0.7)'];
    competitors.forEach((c, idx) => {
        const compRows = recentRows.filter(r => r.query.includes(`[경쟁사:${c.competitor_name}]`));
        const compClaude = compRows.filter(r => r.ai_name.toLowerCase().includes('claude'));
        const compChatgpt = compRows.filter(r => r.ai_name.toLowerCase().includes('chatgpt'));
        const compGemini = compRows.filter(r => r.ai_name.toLowerCase().includes('gemini'));
        
        const compData = [
            compClaude.length ? Math.round(compClaude.filter(r => r.mentioned).length / compClaude.length * 100) : 0,
            compChatgpt.length ? Math.round(compChatgpt.filter(r => r.mentioned).length / compChatgpt.length * 100) : 0,
            compGemini.length ? Math.round(compGemini.filter(r => r.mentioned).length / compGemini.length * 100) : 0
        ];
        
        datasets.push({
            label: c.competitor_name,
            data: compData,
            backgroundColor: colors[idx % colors.length],
            borderWidth: 0
        });
    });

    console.log('recentRows:', recentRows.length);
    console.log('topQueries:', topQueries);
    console.log('nicheScores:', nicheScores);
    console.log('경쟁사 datasets:', datasets);
    
    chartService.updateCompetitorCompareChart(datasets);
}

/**
 * 가장 최근 진단 결과 로드 및 처방 카드 렌더링
 */
async function loadLatestDiagnosisResults() {
    const analysisResults = document.getElementById('analysis-results');
    if (!analysisResults) return;

    try {
        if (!currentStore) return;
        const history = await supabaseService.getAnalysisHistory(currentStore.id, 'monitoring');
        if (!history || history.length === 0) {
            analysisResults.style.display = 'none';
            return;
        }

        const latestTime = history[0].created_at;
        const latestRows = history.filter(h => h.created_at === latestTime);

        // 자사 행들만 추출
        const selfRows = latestRows.filter(r => !r.query.includes('[경쟁사:'));
        if (selfRows.length === 0) return;

        // 대표(첫번째) 결과 추출
        const claudeFirst = selfRows.find(r => r.ai_name === 'Claude');
        const chatgptFirst = selfRows.find(r => r.ai_name === 'ChatGPT');
        const geminiFirst = selfRows.find(r => r.ai_name === 'Gemini');

        // Claude 처방 카드 바인딩
        const claudeEl = document.getElementById('claude-response');
        if (claudeFirst && claudeEl) {
            claudeEl.textContent = claudeFirst.response;
            const parent = claudeEl.closest('.result-card');
            if (parent) {
                const statusEl = parent.querySelector('.status');
                const mentionEl = document.getElementById('claude-mention');
                const prescEl = parent.querySelector('.prescription');
                
                const score = Number(claudeFirst.score) || 0;
                if (score >= 80) {
                    statusEl.className = 'status success';
                    statusEl.textContent = '양호';
                    prescEl.textContent = '현재 상태 유지 및 긍정 리뷰 지속 생성';
                } else if (score >= 40) {
                    statusEl.className = 'status';
                    statusEl.style.backgroundColor = '#f1f5f9';
                    statusEl.style.color = '#475569';
                    statusEl.textContent = '보통';
                    prescEl.textContent = '지역 키워드 매칭 보강 및 주 1회 모니터링';
                } else {
                    statusEl.className = 'status warning';
                    statusEl.textContent = '주의';
                    prescEl.textContent = '플레이스 키워드 재배치 및 메뉴 상세 정보 최신화';
                }
                
                if (mentionEl) {
                    mentionEl.textContent = claudeFirst.mentioned ? claudeFirst.query : '없음';
                }
            }
        }

        // ChatGPT 처방 카드 바인딩
        const chatgptEl = document.getElementById('chatgpt-response');
        if (chatgptFirst && chatgptEl) {
            chatgptEl.textContent = chatgptFirst.response;
            const parent = chatgptEl.closest('.result-card');
            if (parent) {
                const statusEl = parent.querySelector('.status');
                const mentionEl = document.getElementById('chatgpt-mention');
                const prescEl = parent.querySelector('.prescription');
                
                const score = Number(chatgptFirst.score) || 0;
                if (score >= 80) {
                    statusEl.className = 'status success';
                    statusEl.textContent = '양호';
                    prescEl.textContent = '현재 브랜드 키워드 언급 양호, 주기적 관리';
                } else if (score >= 40) {
                    statusEl.className = 'status';
                    statusEl.style.backgroundColor = '#f1f5f9';
                    statusEl.style.color = '#475569';
                    statusEl.textContent = '보통';
                    prescEl.textContent = '상세 영업 정보 및 오시는 길 블로그 배포 보완';
                } else {
                    statusEl.className = 'status warning';
                    statusEl.textContent = '주의';
                    prescEl.textContent = '공식 홈페이지 및 네이버 플레이스 정보 최신화, SEO 태그 점검';
                }
                
                if (mentionEl) {
                    mentionEl.textContent = chatgptFirst.mentioned ? chatgptFirst.query : '없음';
                }
            }
        }

        // Gemini 처방 카드 바인딩
        const geminiEl = document.getElementById('gemini-response');
        if (geminiFirst && geminiEl) {
            geminiEl.textContent = geminiFirst.response;
            const parent = geminiEl.closest('.result-card');
            if (parent) {
                const statusEl = parent.querySelector('.status');
                const mentionEl = document.getElementById('gemini-mention');
                const prescEl = parent.querySelector('.prescription');
                
                const score = Number(geminiFirst.score) || 0;
                if (score >= 80) {
                    statusEl.className = 'status success';
                    statusEl.textContent = '양호';
                    prescEl.textContent = '구글 로컬 가이드 긍정적 연결 활발';
                } else if (score >= 40) {
                    statusEl.className = 'status';
                    statusEl.style.backgroundColor = '#f1f5f9';
                    statusEl.style.color = '#475569';
                    statusEl.textContent = '보통';
                    prescEl.textContent = '블로그 체험단 배포 시 신메뉴 위주 포스팅 가이드 제공';
                } else {
                    statusEl.className = 'status warning';
                    statusEl.textContent = '주의';
                    prescEl.textContent = '구글 비즈니스 프로필 소식 연동 및 메뉴/주차정보 보완';
                }
                
                if (mentionEl) {
                    mentionEl.textContent = geminiFirst.mentioned ? geminiFirst.query : '없음';
                }
            }
        }

        // Claude 종합 처방 요약 텍스트
        const prescriptionEl = document.getElementById('ai-prescription-text');
        if (prescriptionEl) {
            prescriptionEl.value = `${currentStore.store_name || '업체'}의 GEO(생성형 AI 검색 엔진 최적화) 종합 분석 리포트입니다.\n\n` +
                `1. Claude에서는 현재 안정적인 가시성을 보여주고 있으나, 경쟁 브랜드의 신규 언급 점유율 확장에 유의하여 지속적인 긍정 리뷰 유입을 권장합니다.\n` +
                `2. ChatGPT의 정보 최신화가 필요합니다. 일부 상세 영업시간 및 주말 휴무 여부의 혼동이 식별되어 네이버 스마트플레이스 및 지역 소식란의 텍스트 매칭율을 정교화할 것을 처방합니다.\n` +
                `3. Gemini 노출 빈도 개선을 위해 주차 공간 보유 혜택과 시그니처 대표 메뉴에 대한 로컬 포스팅 키워드를 추가 배치할 것을 권장합니다.`;
        }
        
        analysisResults.style.display = 'block';

    } catch (e) {
        console.warn('Failed to load latest diagnosis results:', e);
    }
}

function initContentViewModal() {
    const modal = document.getElementById('content-view-modal');
    if (!modal) return;
    
    const closeBtn1 = document.getElementById('btn-close-content-modal-top');
    const closeBtn2 = document.getElementById('btn-close-content-modal');
    
    const closeModal = () => {
        modal.style.display = 'none';
    };
    
    if (closeBtn1) closeBtn1.addEventListener('click', closeModal);
    if (closeBtn2) closeBtn2.addEventListener('click', closeModal);
    
    // 테이블 내 보기 버튼 이벤트 위임
    const tableBody = document.getElementById('listicle-table-body');
    if (tableBody) {
        tableBody.addEventListener('click', (e) => {
            const btn = e.target.closest('.btn-view-content');
            if (btn) {
                const title = btn.dataset.title || '제3자 리스티클 기사';
                const dateStr = btn.dataset.date || '';
                const bodyContent = decodeURIComponent(btn.dataset.body || '');
                const evDataRaw = btn.dataset.evidence;
                
                document.getElementById('content-view-title').textContent = title;
                document.getElementById('content-view-date').textContent = dateStr;
                document.getElementById('content-view-body').textContent = bodyContent;
                
                // 증거유닛 파싱 및 바인딩
                const evContainer = document.getElementById('content-view-evidence');
                if (evContainer && evDataRaw) {
                    try {
                        const ev = JSON.parse(decodeURIComponent(evDataRaw));
                        if (ev && Object.keys(ev).length > 0) {
                            document.getElementById('ev-stat').textContent = ev.statistics || '미포함';
                            document.getElementById('ev-quote').textContent = ev.quote || '미포함';
                            document.getElementById('ev-source').textContent = ev.source || '미포함';
                            document.getElementById('ev-compare').textContent = ev.comparison || '미포함';
                            evContainer.style.display = 'block';
                        } else {
                            evContainer.style.display = 'none';
                        }
                    } catch (err) {
                        console.warn('Evidence parse error:', err);
                        evContainer.style.display = 'none';
                    }
                } else if (evContainer) {
                    evContainer.style.display = 'none';
                }

                modal.style.display = 'flex';
                
                // 복사 버튼 이벤트 바인딩
                const copyBtn = document.getElementById('btn-copy-content');
                copyBtn.onclick = () => {
                    navigator.clipboard.writeText(bodyContent).then(() => {
                        alert('본문이 클립보드에 복사되었습니다.');
                    }).catch(err => {
                        console.error('Failed to copy text: ', err);
                        alert('복사에 실패했습니다.');
                    });
                };
            }
        });
    }
}


// ================================================================
// Phase 2 — 모니터링 신뢰구간 (Wilson Score)
// ================================================================

/**
 * 질문 체크리스트 렌더링 (업체 변경 시 호출)
 * 기본값: 상위 10개만 선택
 */
function renderMonitoringQueryChecklist() {
    const container = document.getElementById('monitoring-query-checklist');
    if (!container) return;

    let queries = (currentStore && currentStore.queries) || [];
    if (typeof queries === 'string') { try { queries = JSON.parse(queries); } catch(e) { queries = []; } }
    queries = queries.slice(0, 50); // 최대 50개

    if (queries.length === 0) {
        container.innerHTML = '<div style="text-align: center; color: #aaa; padding: 12px; font-size: 0.88rem;">등록된 질문이 없습니다. 설정 탭에서 질문을 먼저 생성해주세요.</div>';
        updateMonitoringCostWarning();
        return;
    }

    container.innerHTML = queries.map((q, i) => `
        <label style="display: flex; align-items: flex-start; gap: 8px; padding: 5px 4px; cursor: pointer; font-size: 0.85rem; border-bottom: 1px solid var(--border-color); user-select: none;">
            <input type="checkbox" class="monitoring-query-cb" value="${escapeHtml(q)}" ${i < 10 ? 'checked' : ''}
                style="margin-top: 2px; flex-shrink: 0; cursor: pointer; accent-color: var(--primary);">
            <span style="color: var(--text-main); line-height: 1.4;">${escapeHtml(q)}</span>
        </label>
    `).join('');

    // 체크박스 변경 → 비용 업데이트
    container.querySelectorAll('.monitoring-query-cb').forEach(cb => {
        cb.addEventListener('change', updateMonitoringCostWarning);
    });

    updateMonitoringCostWarning();
}

/**
 * 모니터링 탭 콘트롤 전체 초기화
 */
function initMonitoringTab() {
    const btnStart = document.getElementById('btn-monitoring-start');
    const btnAbort = document.getElementById('btn-monitoring-abort');
    if (!btnStart) return;

    // 옵션 변경 시 비용 경고 실시간 업데이트
    document.querySelectorAll('input[name="monitoring-repeat"]').forEach(r =>
        r.addEventListener('change', updateMonitoringCostWarning)
    );
    ['claude', 'chatgpt', 'gemini'].forEach(ai => {
        const el = document.getElementById(`monitoring-ai-${ai}`);
        if (el) el.addEventListener('change', updateMonitoringCostWarning);
    });

    // 전체 선택 / 전체 해제
    const btnSelectAll   = document.getElementById('btn-query-select-all');
    const btnDeselectAll = document.getElementById('btn-query-deselect-all');
    if (btnSelectAll) {
        btnSelectAll.addEventListener('click', () => {
            document.querySelectorAll('.monitoring-query-cb').forEach(cb => { cb.checked = true; });
            updateMonitoringCostWarning();
        });
    }
    if (btnDeselectAll) {
        btnDeselectAll.addEventListener('click', () => {
            document.querySelectorAll('.monitoring-query-cb').forEach(cb => { cb.checked = false; });
            updateMonitoringCostWarning();
        });
    }

    btnStart.addEventListener('click', async () => {
        await runMonitoringCycle();
    });

    btnAbort.addEventListener('click', () => {
        window._monitoringAbort = true;
        btnAbort.textContent = '↻ 중단 완료 대기...';
        btnAbort.disabled = true;
    });
}

/**
 * 모니터링 탭 진입 시 기존 주간 추세 로드
 */
async function loadMonitoringTrend() {
    if (!currentStore) return;
    try {
        const summaries = await supabaseService.getMonitoringSummary(currentStore.id, 8);
        chartService.updateWeeklyTrendChart(summaries);
    } catch (e) {
        console.warn('Failed to load monitoring trend:', e);
    }
}

/**
 * 비용 경고 및 시간 추정치 업데이트 (선택된 체크박스 기준)
 */
function updateMonitoringCostWarning() {
    // 체크된 질문 수 기준
    const checkedBoxes = document.querySelectorAll('.monitoring-query-cb:checked');
    const qCount = checkedBoxes.length;

    const repeatCount = parseInt(
        document.querySelector('input[name="monitoring-repeat"]:checked')?.value || 3
    );
    const aiCount = ['claude', 'chatgpt', 'gemini'].filter(ai =>
        document.getElementById(`monitoring-ai-${ai}`)?.checked
    ).length;

    const totalCalls = qCount * (aiCount || 3) * repeatCount;
    const mins = Math.ceil(totalCalls * 1.5 / 60);

    const callEl = document.getElementById('monitoring-call-count');
    const timeEl = document.getElementById('monitoring-time-estimate');
    if (callEl) callEl.textContent = totalCalls.toLocaleString();
    if (timeEl) timeEl.textContent = ` — 약 ${mins}분 소요`;

    // 선택 질문 수 표시
    const selectedCountEl = document.getElementById('monitoring-selected-query-count');
    if (selectedCountEl) selectedCountEl.textContent = `${qCount}개 선택됨`;

    // 질문 수 부족 경고 (5개 미만 시)
    const warnEl  = document.getElementById('monitoring-query-warn');
    const countEl = document.getElementById('monitoring-query-count');
    if (warnEl && countEl) {
        countEl.textContent = qCount;
        warnEl.style.display = qCount < 5 ? 'block' : 'none';
    }
}

/**
 * Wilson Score Interval (95% CI)
 * @param {number} successes - 언급된 횟수
 * @param {number} n         - 전체 시행 횟수
 * @param {number} z         - 신뢰수준 Z값 (1.96 = 95%)
 * @returns {{ rate: number, lower: number, upper: number }} — % 정수
 */
function calcWilsonCI(successes, n, z = 1.96) {
    if (n === 0) return { rate: 0, lower: 0, upper: 0 };
    if (n < 10) console.warn(`Wilson CI: n=${n} 은 신뢰구간이 불안정합니다.`);

    const p   = successes / n;
    const z2  = z * z;
    const denom  = 1 + z2 / n;
    const center = (p + z2 / (2 * n)) / denom;
    const margin = (z / denom) * Math.sqrt(p * (1 - p) / n + z2 / (4 * n * n));

    return {
        rate:  Math.round(p * 100),
        lower: Math.max(0,   Math.round((center - margin) * 100)),
        upper: Math.min(100, Math.round((center + margin) * 100))
    };
}

/**
 * 이번 주의 월요일을 YYYY-MM-DD 형식으로 반환
 */
function getWeekMonday(date = new Date()) {
    const d   = new Date(date);
    const day = d.getDay();   // 0=일요일
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    d.setDate(diff);
    return d.toISOString().split('T')[0];
}

/** AI 레이블 헬퍼 */
function getAILabel(ai) {
    return { claude: 'Claude', chatgpt: 'ChatGPT', gemini: 'Gemini' }[ai] || ai;
}

/** AI 색상 헬퍼 */
function getAIColor(ai) {
    return { claude: '#185FA5', chatgpt: '#3B6D11', gemini: '#854F0B' }[ai] || '#555';
}

/**
 * AI API 단일 호출 (monitoring 전용 래퍼)
 * @returns {string} 응답 텍스트 (실패 시 빈 문자열)
 */
async function callAIForMonitoring(aiType, question) {
    try {
        let result;
        if (aiType === 'claude')  result = await apiService.callClaude(question);
        else if (aiType === 'chatgpt') result = await apiService.callChatGPT(question);
        else if (aiType === 'gemini')  result = await apiService.callGemini(question);
        return (result && result.data) ? result.data : '';
    } catch (e) {
        console.warn(`Monitoring API error (${aiType}):`, e.message);
        return '';  // 실패 시 mentioned = false 처리
    }
}

/**
 * HTML 이스케이프 헬퍼
 */
function escapeHtml(text) {
    if (!text) return '';
    return text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

/**
 * 신뢰구간 결과 카드 1개 렌더링 (AI 1개 완료 시 즉시 호출)
 */
function renderCICard(aiType, ci, n) {
    const container = document.getElementById('ci-cards-container');
    if (!container) return;

    const color = getAIColor(aiType);
    const label = getAILabel(aiType);
    const html = `
        <div class="ci-result-card" id="ci-card-${aiType}">
            <div class="ci-ai-label" style="color:${color};">${label}</div>
            <div class="ci-bar-wrap">
                <div class="ci-bar-fill" style="background:${color}; width:${ci.rate}%;"></div>
            </div>
            <div class="ci-rate" style="color:${color};">${ci.rate}%</div>
            <div class="ci-badge">[${ci.lower}–${ci.upper}]</div>
            <div class="ci-n">n=${n}</div>
        </div>`;

    const existing = document.getElementById(`ci-card-${aiType}`);
    if (existing) existing.outerHTML = html;
    else container.insertAdjacentHTML('beforeend', html);
}

/**
 * GEO Score 실시간 업데이트
 * @param {{ claude?: number, chatgpt?: number, gemini?: number }} components - AI별 언급률(%)
 */
function updateGeoScoreDisplay(components) {
    const weights = { claude: 0.4, chatgpt: 0.4, gemini: 0.2 };
    let score = 0;
    Object.entries(components).forEach(([ai, rate]) => {
        score += rate * (weights[ai] || 0);
    });
    const el = document.getElementById('ci-geo-score');
    if (el) el.textContent = Math.round(score);
}

/**
 * 질문별 상세 테이블 렌더링
 * @param {string[]} queries
 * @param {{ claude?: Object, chatgpt?: Object, gemini?: Object }} allResults
 *        각 AI는 { [question]: { mentioned: n, total: n } } 형식
 */
function renderDetailTable(queries, allResults) {
    const tbody = document.getElementById('monitoring-detail-table-body');
    if (!tbody) return;

    const ALL_AIS = ['claude', 'chatgpt', 'gemini'];
    tbody.innerHTML = queries.map((q, i) => {
        const cells = ALL_AIS.map(ai => {
            const agg = (allResults[ai] || {})[q];
            if (!agg || agg.total === 0) return `<td class="mentioned-no">—</td>`;
            const { mentioned, total } = agg;
            if (mentioned === total) return `<td class="mentioned-yes">✓ ${mentioned}/${total}</td>`;
            if (mentioned === 0)     return `<td class="mentioned-no">✗ 0/${total}</td>`;
            return `<td class="mentioned-partial">△ ${mentioned}/${total}</td>`;
        }).join('');
        return `<tr>
            <td style="color:#aaa;font-size:0.8rem;text-align:center;">${i + 1}</td>
            <td style="font-size:0.87rem;">${escapeHtml(q)}</td>
            ${cells}
        </tr>`;
    }).join('');
}

/**
 * 메인 측정 루프
 * 질문 50개 × N회 반복 → Wilson CI 계산 → Supabase 저장
 */
async function runMonitoringCycle() {
    if (!currentStore) { alert('업체를 먼저 선택해주세요.'); return; }

    // 설정 수집
    const repeatCount = parseInt(
        document.querySelector('input[name="monitoring-repeat"]:checked')?.value || 3
    );
    const selectedAIs = ['claude', 'chatgpt', 'gemini'].filter(ai =>
        document.getElementById(`monitoring-ai-${ai}`)?.checked
    );
    if (selectedAIs.length === 0) { alert('AI를 1개 이상 선택해주세요.'); return; }

    // 선택된 체크박스 질문만 사용
    const checkedBoxes = document.querySelectorAll('.monitoring-query-cb:checked');
    const queries = Array.from(checkedBoxes).map(cb => cb.value);
    if (queries.length === 0) {
        alert('측정할 질문을 1개 이상 선택해주세요.');
        return;
    }

    const storeName  = (currentStore.store_name || '').toLowerCase();
    const week       = getWeekMonday();
    const totalCalls = queries.length * selectedAIs.length * repeatCount;
    let completedCalls = 0;

    // UI 잠금
    window._monitoringAbort = false;
    const btnStart    = document.getElementById('btn-monitoring-start');
    const btnAbort    = document.getElementById('btn-monitoring-abort');
    const progressWrap = document.getElementById('monitoring-progress-wrap');
    const resultsCard  = document.getElementById('monitoring-results-card');
    const ciContainer  = document.getElementById('ci-cards-container');
    const geoEl        = document.getElementById('ci-geo-score');

    btnStart.disabled = true;
    if (btnAbort)    { btnAbort.style.display = 'inline-flex'; btnAbort.disabled = false; btnAbort.textContent = '⛔ 중단'; }
    if (progressWrap) progressWrap.style.display = 'block';
    if (resultsCard)  resultsCard.style.display  = 'block';
    if (ciContainer)  ciContainer.innerHTML = '';
    if (geoEl)        geoEl.textContent = '—';

    const setProgress = (text) => {
        const pct = totalCalls > 0 ? Math.round((completedCalls / totalCalls) * 100) : 0;
        const bar = document.getElementById('monitoring-progress-bar');
        const txt = document.getElementById('monitoring-progress-text');
        if (bar) bar.style.width = pct + '%';
        if (txt) txt.textContent = `${pct}% — ${text}`;
    };

    // 질문별 집계 저장소
    const allResults   = {};   // { ai: { question: { mentioned, total } } }
    const geoComponents = {};

    try {
        for (const ai of selectedAIs) {
            if (window._monitoringAbort) break;

            // 질문별 집계 초기화
            const agg = {};
            queries.forEach(q => { agg[q] = { mentioned: 0, total: 0 }; });

            for (let run = 1; run <= repeatCount; run++) {
                if (window._monitoringAbort) break;
                const batchRows = [];

                for (let qi = 0; qi < queries.length; qi++) {
                    if (window._monitoringAbort) break;
                    const q = queries[qi];

                    setProgress(`Round ${run}/${repeatCount} | ${getAILabel(ai)}: ${qi + 1}/${queries.length}번 질문`);

                    const text = await callAIForMonitoring(ai, q);
                    const mentioned = storeName ? text.toLowerCase().includes(storeName) : false;

                    agg[q].total++;
                    if (mentioned) agg[q].mentioned++;

                    batchRows.push({
                        store_id: currentStore.id,
                        question: q, ai_type: ai,
                        mentioned, run_index: run, week
                    });
                    completedCalls++;

                    await new Promise(r => setTimeout(r, 300));  // 레이트리미트 방지
                }

                // 라운드 1회 완료 시 Supabase 배치 저장
                if (batchRows.length > 0) {
                    await supabaseService.saveMonitoringResult(batchRows);
                }
            }

            // AI 1개 완료 → 즉시 Wilson CI 계산 + 카드 렌더 (Q2)
            const totalMentioned = Object.values(agg).reduce((s, v) => s + v.mentioned, 0);
            const totalN         = Object.values(agg).reduce((s, v) => s + v.total, 0);
            const ci = calcWilsonCI(totalMentioned, totalN);

            allResults[ai] = agg;
            geoComponents[ai] = ci.rate;

            renderCICard(ai, ci, totalN);            // 카드 즉시 표시
            updateGeoScoreDisplay(geoComponents);    // GEO Score 실시간 갱신

            // Supabase 요약 upsert
            await supabaseService.upsertMonitoringSummary([{
                store_id: currentStore.id, week, ai_type: ai,
                mention_rate: ci.rate,
                ci_lower: ci.lower, ci_upper: ci.upper,
                n: totalN
            }]);
        }

        // 전체 완료 시: 상세 테이블 + 주간 추세
        if (!window._monitoringAbort) {
            renderDetailTable(queries, allResults);
            const detailCard = document.getElementById('monitoring-detail-card');
            if (detailCard) detailCard.style.display = 'block';

            const summaries = await supabaseService.getMonitoringSummary(currentStore.id, 8);
            chartService.updateWeeklyTrendChart(summaries);

            setProgress('측정 완료 ✅');
        } else {
            setProgress('⛔ 측정이 중단되었습니다. (완료된 부분은 저장되었습니다)');
        }

    } catch (err) {
        console.error('Monitoring cycle error:', err);
        setProgress(`❌ 오류: ${err.message}`);
    } finally {
        btnStart.disabled = false;
        if (btnAbort) btnAbort.style.display = 'none';
        window._monitoringAbort = false;
    }
}

// ================================================================
// Phase 4 — 채널 배포 (오토파일럿)
// ================================================================

let currentSelectedQueueItem = null;

/**
 * 채널 배포 탭 초기화
 */
function initDistributionTab() {
    const previewTabs = document.querySelectorAll('#distribution-preview-tabs .tab');
    previewTabs.forEach(tab => {
        tab.addEventListener('click', () => {
            previewTabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');

            const channel = tab.getAttribute('data-channel');
            if (currentSelectedQueueItem) {
                renderChannelPreview(currentSelectedQueueItem.contents, channel);
            }
        });
    });
}

/**
 * 배포 대기 목록 및 이력 로드
 */
async function loadDistributionQueue() {
    const pendingTableBody = document.getElementById('distribution-pending-table-body');
    const historyTableBody = document.getElementById('distribution-history-table-body');
    const previewTabs = document.getElementById('distribution-preview-tabs');
    const previewArea = document.getElementById('distribution-preview-area');

    if (!pendingTableBody || !historyTableBody || !currentStore) return;

    try {
        const queue = await supabaseService.getDistributionQueue(currentStore.id) || [];
        const pendingItems = queue.filter(item => item.status === '대기');
        const historyItems = queue.filter(item => item.status === '발행완료');

        // 1. 대기 목록 렌더링
        if (pendingItems.length > 0) {
            pendingTableBody.innerHTML = pendingItems.map(item => {
                const title = item.contents?.title || '제목 없음';
                
                let channelName = '';
                switch (item.channel) {
                    case 'naver_blog': channelName = '네이버 블로그'; break;
                    case 'instagram': channelName = '인스타 카드'; break;
                    case 'seenow': channelName = 'Seenow 미니홈피'; break;
                    case 'google_business': channelName = '구글 비즈니스'; break;
                    default: channelName = item.channel;
                }

                return `
                    <tr data-id="${item.id}" class="${currentSelectedQueueItem && currentSelectedQueueItem.id === item.id ? 'active-row' : ''}">
                        <td style="font-weight: 600; text-align: left;">${escapeHtml(title)}</td>
                        <td><span class="ci-badge" style="font-size: 0.8rem; background-color: #f0f4f8; color: #185FA5;">${escapeHtml(channelName)}</span></td>
                        <td><span style="color: #f39c12; font-weight: bold;">대기</span></td>
                        <td>
                            <button class="btn btn-primary btn-publish-item" 
                                    style="padding: 4px 10px; font-size: 11px; margin: 0;"
                                    data-id="${item.id}" 
                                    data-channel="${item.channel}">발행하기</button>
                        </td>
                    </tr>
                `;
            }).join('');

            // 대기 행 클릭 리스너 등록
            pendingTableBody.querySelectorAll('tr').forEach(row => {
                row.addEventListener('click', (e) => {
                    // 발행 버튼 클릭 시에는 행 클릭 무시
                    if (e.target.closest('.btn-publish-item')) return;

                    const id = row.getAttribute('data-id');
                    const selected = pendingItems.find(item => item.id === id);
                    if (selected) {
                        currentSelectedQueueItem = selected;
                        
                        // 행 활성화 스타일
                        pendingTableBody.querySelectorAll('tr').forEach(r => r.classList.remove('active-row'));
                        row.classList.add('active-row');

                        // 미리보기 탭 활성화 및 렌더링
                        if (previewTabs) previewTabs.style.display = 'flex';
                        const activeTab = document.querySelector('#distribution-preview-tabs .tab.active');
                        const channel = activeTab ? activeTab.getAttribute('data-channel') : 'naver_blog';
                        renderChannelPreview(selected.contents, channel);
                    }
                });
            });

            // 발행 버튼 클릭 리스너 등록
            pendingTableBody.querySelectorAll('.btn-publish-item').forEach(btn => {
                btn.addEventListener('click', async (e) => {
                    e.stopPropagation();
                    const id = btn.getAttribute('data-id');
                    const channel = btn.getAttribute('data-channel');
                    await publishContent(id, channel);
                });
            });

            // 선택된 항목이 있다면 다시 그리기, 없으면 첫 번째 자동 선택
            if (currentSelectedQueueItem) {
                const stillExists = pendingItems.some(i => i.id === currentSelectedQueueItem.id);
                if (stillExists) {
                    const activeRow = pendingTableBody.querySelector(`tr[data-id="${currentSelectedQueueItem.id}"]`);
                    if (activeRow) activeRow.classList.add('active-row');
                    if (previewTabs) previewTabs.style.display = 'flex';
                    const activeTab = document.querySelector('#distribution-preview-tabs .tab.active');
                    const channel = activeTab ? activeTab.getAttribute('data-channel') : 'naver_blog';
                    renderChannelPreview(currentSelectedQueueItem.contents, channel);
                } else {
                    currentSelectedQueueItem = null;
                    triggerFirstItemSelect();
                }
            } else {
                triggerFirstItemSelect();
            }

            function triggerFirstItemSelect() {
                if (pendingItems.length > 0) {
                    const firstRow = pendingTableBody.querySelector('tr');
                    if (firstRow) firstRow.click();
                }
            }

        } else {
            pendingTableBody.innerHTML = '<tr><td colspan="4" style="text-align: center; color: #999; padding: 25px;">대기 중인 배포 건이 없습니다.</td></tr>';
            if (previewTabs) previewTabs.style.display = 'none';
            if (previewArea) {
                previewArea.innerHTML = `
                    <div style="text-align: center; color: #999; padding: 50px 20px; border: 2px dashed var(--border-color); border-radius: 8px;">
                        📢 배포 대기 목록에서 리스티클을 선택하시면 실시간 채널별 미리보기가 여기에 표시됩니다.
                    </div>
                `;
            }
            currentSelectedQueueItem = null;
        }

        // 2. 이력 목록 렌더링
        if (historyItems.length > 0) {
            historyTableBody.innerHTML = historyItems.map(item => {
                const title = item.contents?.title || '제목 없음';
                const dateStr = item.published_at ? new Date(item.published_at).toLocaleString('ko-KR') : '알 수 없음';
                
                let channelName = '';
                switch (item.channel) {
                    case 'naver_blog': channelName = '네이버 블로그'; break;
                    case 'instagram': channelName = '인스타 카드'; break;
                    case 'seenow': channelName = 'Seenow 미니홈피'; break;
                    case 'google_business': channelName = '구글 비즈니스'; break;
                    default: channelName = item.channel;
                }

                return `
                    <tr>
                        <td><span class="ci-badge" style="font-size: 0.8rem; background-color: #f0f4f8; color: #555;">${escapeHtml(channelName)}</span></td>
                        <td>${dateStr}</td>
                        <td style="font-weight: 500; text-align: left;">${escapeHtml(title)}</td>
                        <td><span style="color: var(--success); font-weight: bold;">발행 완료</span></td>
                    </tr>
                `;
            }).join('');
        } else {
            historyTableBody.innerHTML = '<tr><td colspan="4" style="text-align: center; color: #999; padding: 25px;">발행 이력이 없습니다.</td></tr>';
        }

    } catch (err) {
        console.error('Failed to load distribution queue:', err);
    }
}

/**
 * 콘텐츠 발행 처리
 */
async function publishContent(itemId, channel) {
    let chanName = '';
    switch (channel) {
        case 'naver_blog': chanName = '네이버 블로그'; break;
        case 'instagram': chanName = '인스타 카드'; break;
        case 'seenow': chanName = 'Seenow 미니홈피'; break;
        case 'google_business': chanName = '구글 비즈니스'; break;
        default: chanName = channel;
    }

    if (!confirm(`선택한 리스티클을 [${chanName}] 채널에 최종 발행 승인하시겠습니까?\n이 작업은 화이트햇 원칙에 의해 사람의 승인 후 즉시 완료됩니다.`)) {
        return;
    }

    try {
        const res = await supabaseService.updateDistributionStatus(itemId, '발행완료');
        if (res) {
            alert(`콘텐츠가 [${chanName}] 채널로 성공적으로 발행 처리되었습니다.`);
            
            // 발행 성공 시 콘텐츠 생성 목록의 배포 상태 표시에 반영되도록 리로드
            await loadListiclesList();
            
            // 현재 선택 해제
            if (currentSelectedQueueItem && currentSelectedQueueItem.id === itemId) {
                currentSelectedQueueItem = null;
            }
            // 목록 새로고침
            await loadDistributionQueue();
        } else {
            alert('발행 처리에 실패했습니다. 다시 시도해 주세요.');
        }
    } catch (err) {
        console.error('Publish error:', err);
        alert('발행 처리 도중 오류가 발생했습니다.');
    }
}

/**
 * 채널별 미리보기 렌더링
 */
function renderChannelPreview(content, channel) {
    const previewArea = document.getElementById('distribution-preview-area');
    if (!previewArea) return;

    if (!content) {
        previewArea.innerHTML = '<div style="text-align: center; color: #999; padding: 30px;">기사 본문을 불러오지 못했습니다.</div>';
        return;
    }

    // 마크다운 파싱 헬퍼 함수
    function parseMarkdown(md) {
        if (!md) return '';
        // Escape HTML
        let html = escapeHtml(md);
        
        // Bold: **text** -> <strong>text</strong>
        html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
        
        // Headings: ### text -> <h3>text</h3>
        html = html.replace(/^### (.*?)$/gm, '<h3>$1</h3>');
        
        // Quote lines starting with >
        html = html.replace(/^&gt; (.*?)$/gm, '<blockquote>$1</blockquote>');
        
        // Paragraph division
        const paragraphs = html.split(/\n\n+/);
        return paragraphs.map(p => {
            p = p.trim();
            if (!p) return '';
            if (p.startsWith('<h3>') || p.startsWith('<blockquote>')) return p;
            return `<p>${p.replace(/\n/g, '<br>')}</p>`;
        }).join('');
    }

    const title = content.title || '제목 없음';
    const bodyHtml = parseMarkdown(content.body || '');
    const dateToday = new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' }).replace(/\.\s/g, '.').replace(/\.$/, '');
    const storeName = currentStore ? currentStore.store_name : '우리 업체';

    let html = '';

    switch (channel) {
        case 'naver_blog':
            html = `
                <div class="naver-blog-mock">
                    <div class="naver-blog-header">
                        <div class="naver-blog-category">가평 핫플레이스 추천</div>
                        <h1 class="naver-blog-title">${escapeHtml(title)}</h1>
                        <div class="naver-blog-author">
                            <div class="naver-blog-avatar">${escapeHtml(storeName[0])}</div>
                            <strong>${escapeHtml(storeName)} 공식블로그</strong>
                            <span style="color:#bbb;">•</span>
                            <span>${dateToday}</span>
                        </div>
                    </div>
                    <div class="naver-blog-body">
                        ${bodyHtml}
                        ${content.evidence_units?.quote ? `
                            <div class="naver-blog-quote">
                                <strong>💡 한줄 평:</strong> "${escapeHtml(content.evidence_units.quote)}"
                            </div>
                        ` : ''}
                    </div>
                </div>
            `;
            break;

        case 'instagram':
            const initial = storeName[0];
            const captionSummary = (content.body || '').replace(/###/g, '').replace(/\*\*/g, '').substring(0, 150) + '...';
            const keywordTag = content.niche_keyword ? '#' + content.niche_keyword.replace(/\s+/g, '') : '#가평맛집';
            
            html = `
                <div class="instagram-mock">
                    <div class="instagram-header">
                        <div class="instagram-profile">
                            <div class="instagram-avatar">
                                <div class="instagram-avatar-inner">${escapeHtml(initial)}</div>
                            </div>
                            <div class="instagram-author-info">
                                <span class="instagram-username">${escapeHtml(storeName.replace(/\s+/g, '_').toLowerCase())}</span>
                                <span class="instagram-location">${escapeHtml(currentStore?.address || '가평')}</span>
                            </div>
                        </div>
                        <span style="font-weight: bold; cursor: pointer; color: #262626;">•••</span>
                    </div>
                    <div class="instagram-card-graphic">
                        <div class="instagram-card-title">${escapeHtml(title)}</div>
                        <div class="instagram-card-tag">${escapeHtml(content.niche_keyword || '추천 맛집')}</div>
                        <div class="instagram-card-footer-logo">${escapeHtml(storeName.toUpperCase())}</div>
                    </div>
                    <div class="instagram-actions">
                        <div class="instagram-actions-left">
                            <span>❤️</span> <span>💬</span> <span>✈️</span>
                        </div>
                        <div>🔖</div>
                    </div>
                    <div class="instagram-likes">좋아요 128개</div>
                    <div class="instagram-caption-section">
                        <p class="instagram-caption-text">
                            <strong>${escapeHtml(storeName.replace(/\s+/g, '_').toLowerCase())}</strong> 
                            ${escapeHtml(captionSummary)}
                        </p>
                        <span class="instagram-hashtags">
                            ${escapeHtml(keywordTag)} #현리맛집 #조종면맛집 #가평핫플 #가평단골 #가평회식장소 #설맥
                        </span>
                    </div>
                </div>
            `;
            break;

        case 'seenow':
            let parsedHours = currentStore?.hours || {};
            if (typeof parsedHours === 'string') {
                try { parsedHours = JSON.parse(parsedHours); } catch(e) { parsedHours = {}; }
            }
            const hoursVal = parsedHours.mon ? parsedHours.mon : '17:00 ~ 24:00';

            html = `
                <div class="seenow-mock">
                    <div class="seenow-banner">
                        <span class="seenow-logo">Seenow.kr</span>
                        <span class="seenow-store-badge">Local Guide</span>
                    </div>
                    <div class="seenow-store-card">
                        <h1 class="seenow-store-name">${escapeHtml(storeName)}</h1>
                        <div class="seenow-info-list">
                            <span class="seenow-info-badge">📍 ${escapeHtml(currentStore?.address || '위치 정보')}</span>
                            <span class="seenow-info-badge">🕒 영업: ${escapeHtml(hoursVal)}</span>
                            <span class="seenow-info-badge">🚗 주차: ${escapeHtml(currentStore?.parking || '가능')}</span>
                        </div>
                    </div>
                    <div class="seenow-body">
                        <h2>${escapeHtml(title)}</h2>
                        <div class="seenow-text">
                            ${bodyHtml}
                        </div>
                    </div>
                </div>
            `;
            break;

        case 'google_business':
            html = `
                <div class="google-biz-mock">
                    <div class="google-biz-header">
                        <div class="google-biz-avatar">G</div>
                        <div class="google-biz-info">
                            <span class="google-biz-name">${escapeHtml(storeName)}</span>
                            <span class="google-biz-post-type">구글 비즈니스 프로필 소식 • 방금 전</span>
                        </div>
                    </div>
                    <div class="google-biz-body">
                        <h3>${escapeHtml(title)}</h3>
                        ${bodyHtml}
                        <button class="google-biz-btn" onclick="alert('Seenow 미니홈피 예약 페이지로 연결됩니다.'); return false;">더 알아보기</button>
                    </div>
                </div>
            `;
            break;

        default:
            previewArea.innerHTML = `<div style="padding: 20px;">지원하지 않는 채널입니다: ${channel}</div>`;
            return;
    }

    previewArea.innerHTML = html;
}

/**
 * 인라인 토스트 메시지 표시 헬퍼
 * @param {string} message - 표시할 안내 문구
 */
function showToast(message) {
    const existing = document.getElementById('app-toast-message');
    if (existing) {
        existing.remove();
    }

    const toast = document.createElement('div');
    toast.id = 'app-toast-message';
    toast.textContent = message;
    
    // 동적 인라인 스타일 부여 (화면 상단 중앙, sleek 디자인)
    Object.assign(toast.style, {
        position: 'fixed',
        top: '20px',
        left: '50%',
        transform: 'translateX(-50%)',
        background: 'rgba(30, 41, 59, 0.95)',
        color: '#ffffff',
        padding: '12px 24px',
        borderRadius: '8px',
        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
        zIndex: '9999',
        fontSize: '0.92rem',
        fontWeight: '500',
        pointerEvents: 'none',
        opacity: '0',
        transition: 'opacity 0.2s ease-in-out',
        textAlign: 'center',
        maxWidth: '90%',
        wordBreak: 'keep-all'
    });

    document.body.appendChild(toast);

    // reflow 트리거 후 페이드인
    toast.offsetHeight;
    toast.style.opacity = '1';

    // 2초 후 페이드아웃 및 엘리먼트 제거
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.addEventListener('transitionend', () => {
            toast.remove();
        });
    }, 2000);
}


