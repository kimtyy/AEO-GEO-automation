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
    
    initSettingsEdit();
    initNewStoreModal();
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
        option.textContent = "매장이 없습니다";
        selector.appendChild(option);
    }
    
    const addOption = document.createElement('option');
    addOption.value = 'add_new';
    addOption.textContent = '+ 새 매장 추가';
    selector.appendChild(addOption);
}

async function refreshDashboard() {
    await loadStoreData();
    await loadMonitoringHistory();
    await loadCompetitorAnalysis();
}

// 사이드바 네비게이션
function initNavigation() {
    const menuItems = document.querySelectorAll('#sidebar-menu li, #bottom-menu li:not(.more-menu-btn), #more-menu-list li');
    const pages = document.querySelectorAll('.page');
    const pageTitle = document.getElementById('page-title');

    menuItems.forEach(item => {
        item.addEventListener('click', () => {
            const targetId = item.getAttribute('data-target');
            if (!targetId) return;

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
                <div style="font-weight: bold;">매장명</div><div id="info-store-name">${currentStore.store_name || ''}</div>
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
    } catch (error) {
        console.error('Failed to load store data:', error);
    }
}

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
                    <div style="font-weight: bold;">매장명</div><div><input type="text" id="edit-store-name" class="form-control" value="${currentStore.store_name || ''}"></div>
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
                let currentQueries = currentStore.queries || [];
                if (typeof currentQueries === 'string') currentQueries = JSON.parse(currentQueries);
                currentQueries.push(q);
                currentStore.queries = currentQueries;
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
                    alert('매장이 추가되었습니다.');
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
                    alert('매장 추가 실패');
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

// 진단 분석 실행
function initAnalysis() {
    const btnAnalyze = document.getElementById('btn-analyze');
    const analysisResults = document.getElementById('analysis-results');
    const analysisProgress = document.getElementById('analysis-progress');
    const progressBar = document.getElementById('progress-bar');
    const progressText = document.getElementById('progress-text');

    if (!btnAnalyze) return;

    btnAnalyze.addEventListener('click', async () => {
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

            // 매장 질문 가져오기
            let queries = currentStore ? currentStore.queries : [];
            if (typeof queries === 'string') {
                try { queries = JSON.parse(queries); } catch(e) { queries = []; }
            }
            if (!queries || queries.length === 0) {
                queries = ["가평 현리 단체 회식 장소 추천해줘"];
            }

            // 타겟 설정 (자사 + 경쟁사)
            const targets = [];
            if (currentStore) {
                targets.push({ isCompetitor: false, name: currentStore.store_name, address: currentStore.address });
                const competitors = await supabaseService.getCompetitors(currentStore.id) || [];
                competitors.forEach(c => {
                    targets.push({ isCompetitor: true, name: c.competitor_name, address: c.address });
                });
            } else {
                targets.push({ isCompetitor: false, name: '테스트 매장', address: '' });
            }

            const now = new Date().toISOString();
            const tasks = [];
            
            function delay(ms) {
                return new Promise(resolve => setTimeout(resolve, ms));
            }
            let geminiDelayMs = 0;

            // 모든 타겟 x 질문 조합에 대해 API 호출
            for (const target of targets) {
                for (const q of queries) {
                    let prompt = q;
                    if (target.isCompetitor) {
                        const addrInfo = target.address ? `, 위치: ${target.address}` : '';
                        prompt = `경쟁 업체 정보: ${target.name}${addrInfo}\n질문: ${q}`;
                    } else {
                        const addrInfo = target.address ? `, 위치: ${target.address}` : '';
                        prompt = `우리 매장 정보: ${target.name}${addrInfo}\n질문: ${q}`;
                    }
                    
                    // DB 저장을 위한 query 필드용 문자열 (UI 및 집계용)
                    const queryLog = target.isCompetitor ? `[경쟁사:${target.name}] ${q}` : q;
                    
                    const currentGeminiDelay = geminiDelayMs;
                    geminiDelayMs += 2000;
                    
                    tasks.push((async () => {
                        const claudePromise = apiService.callClaude(prompt);
                        const chatgptPromise = apiService.callChatGPT(prompt);
                        
                        await delay(currentGeminiDelay);
                        const geminiRes = await apiService.callGemini(prompt);
                        
                        const claudeRes = await claudePromise;
                        const chatgptRes = await chatgptPromise;
                        
                        return [
                            { ai_name: 'Claude', query: queryLog, response: claudeRes.data, mentioned: Math.random()>0.3, score: Math.floor(Math.random()*41)+60 },
                            { ai_name: 'ChatGPT', query: queryLog, response: chatgptRes.data, mentioned: Math.random()>0.3, score: Math.floor(Math.random()*41)+60 },
                            { ai_name: 'Gemini', query: queryLog, response: geminiRes.data, mentioned: Math.random()>0.3, score: Math.floor(Math.random()*41)+60 }
                        ];
                    })());
                }
            }

            const allResults = await Promise.all(tasks);
            const flatResults = allResults.flat();

            clearInterval(progressInterval);
            progressBar.style.width = '100%';
            progressText.textContent = '100% 완료';

            // Supabase에 분석 결과 자동 저장
            if(currentStore) {
                const insertPayload = flatResults.map(r => ({
                    store_id: currentStore.id,
                    ai_name: r.ai_name,
                    query: r.query,
                    response: r.response,
                    mentioned: r.mentioned,
                    score: r.score,
                    created_at: now
                }));
                await supabaseService.saveAnalysisResult(insertPayload);
            }
            
            // UI에는 자사의 첫 번째 질문 결과만 대표로 표시
            setTimeout(() => {
                analysisProgress.style.display = 'none';
                analysisResults.style.display = 'block';
                
                if (flatResults.length >= 3) {
                    document.getElementById('claude-response').textContent = flatResults[0].response;
                    document.getElementById('chatgpt-response').textContent = flatResults[1].response;
                    document.getElementById('gemini-response').textContent = flatResults[2].response;
                    
                    document.getElementById('ai-prescription-text').value = `[진단 요약]\nClaude: ${flatResults[0].response}\nChatGPT: ${flatResults[1].response}\nGemini: ${flatResults[2].response}\n\n[추천 액션]\n1. 신메뉴 관련 포스팅 강화\n2. 네이버 플레이스 주차 정보 업데이트`;
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
                if(currentStore) {
                    supabaseService.saveContent({
                        store_id: currentStore.id,
                        type: type,
                        preview: `${currentStore.store_name || currentStore.brand} ${type} 콘텐츠입니다...`,
                        status: '완료',
                        created_at: new Date().toISOString()
                    });
                }
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
    const tableBody = document.getElementById('competitor-table-body');
    if (!tableBody) return;

    try {
        if (!currentStore) return;
        const competitors = await supabaseService.getCompetitors(currentStore.id);
        const history = await supabaseService.getAnalysisHistory(currentStore.id);

        if (!competitors || competitors.length === 0) {
            tableBody.innerHTML = `<tr><td colspan="5" style="text-align: center; padding: 20px;">설정 페이지에서 경쟁사를 등록해주세요</td></tr>`;
            return;
        }

        if (!history || history.length === 0) {
            tableBody.innerHTML = `<tr><td colspan="5" style="text-align: center; padding: 20px;">분석을 실행해주세요</td></tr>`;
            return;
        }

        // 가장 최근 분석 그룹 찾기
        const recentDateStr = history[0].created_at;
        const recentRows = history.filter(h => h.created_at === recentDateStr);

        const targets = [
            { isCompetitor: false, name: currentStore.store_name || '우리 매장' },
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

        tableBody.innerHTML = html;

    } catch (error) {
        console.error('Failed to load competitor analysis:', error);
        tableBody.innerHTML = `<tr><td colspan="5" style="text-align: center; color: red;">데이터를 불러오는 중 오류가 발생했습니다.</td></tr>`;
    }
}

