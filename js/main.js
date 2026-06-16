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
    
    selector.addEventListener('change', (e) => {
        if (e.target.value === 'add_new') {
            document.getElementById('new-store-modal').style.display = 'block';
            selector.value = currentStore ? currentStore.id : '';
            return;
        }
        currentStore = storesList.find(s => s.id === e.target.value);
        refreshDashboard();
    });
    
    refreshDashboard();
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

function refreshDashboard() {
    loadStoreData();
    loadMonitoringHistory();
}

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

// currentStore 변수 데이터 로드
function loadStoreData() {
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
            settingsStoreInfo.innerHTML = `
                <div style="font-weight: bold;">매장명</div><div id="info-store-name">${currentStore.store_name || ''}</div>
                <div style="font-weight: bold;">브랜드</div><div id="info-brand">${currentStore.brand || ''}</div>
                <div style="font-weight: bold;">주소</div><div id="info-address">${currentStore.address || ''}</div>
                <div style="font-weight: bold;">업종</div><div id="info-category">${currentStore.category || ''}</div>
                <div style="font-weight: bold;">컨셉</div><div id="info-concept">${currentStore.concept || ''}</div>
                <div style="font-weight: bold;">영업시간</div><div id="info-hours">${currentStore.hours || ''}</div>
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
                btn.addEventListener('click', (e) => {
                    const idx = e.target.getAttribute('data-index');
                    let currentQueries = currentStore.queries || [];
                    if (typeof currentQueries === 'string') currentQueries = JSON.parse(currentQueries);
                    currentQueries.splice(idx, 1);
                    currentStore.queries = currentQueries;
                    loadStoreData();
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
        btnEdit.addEventListener('click', () => {
            isEditing = !isEditing;
            const container = document.getElementById('settings-store-info');
            
            if (isEditing) {
                btnEdit.textContent = '취소';
                container.innerHTML = `
                    <div style="font-weight: bold;">매장명</div><div><input type="text" id="edit-store-name" class="form-control" value="${currentStore.store_name || ''}"></div>
                    <div style="font-weight: bold;">브랜드</div><div><input type="text" id="edit-brand" class="form-control" value="${currentStore.brand || ''}"></div>
                    <div style="font-weight: bold;">주소</div><div><input type="text" id="edit-address" class="form-control" value="${currentStore.address || ''}"></div>
                    <div style="font-weight: bold;">업종</div><div><input type="text" id="edit-category" class="form-control" value="${currentStore.category || ''}"></div>
                    <div style="font-weight: bold;">컨셉</div><div><input type="text" id="edit-concept" class="form-control" value="${currentStore.concept || ''}"></div>
                    <div style="font-weight: bold;">영업시간</div><div><input type="text" id="edit-hours" class="form-control" value="${currentStore.hours || ''}"></div>
                `;
            } else {
                btnEdit.textContent = '수정';
                loadStoreData(); // discard changes
            }
        });
    }
    
    if (btnAddQuery) {
        btnAddQuery.addEventListener('click', () => {
            const val = queryInput.value.trim();
            if (val && currentStore) {
                let queries = currentStore.queries || [];
                if (typeof queries === 'string') queries = JSON.parse(queries);
                queries.push(val);
                currentStore.queries = queries;
                queryInput.value = '';
                loadStoreData();
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
                updatedData.hours = document.getElementById('edit-hours').value;
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
                    loadStoreData();
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
            const data = {
                store_name: document.getElementById('modal-store-name').value,
                brand: document.getElementById('modal-store-brand').value,
                address: document.getElementById('modal-store-address').value,
                category: document.getElementById('modal-store-category').value,
                concept: document.getElementById('modal-store-concept').value,
                hours: document.getElementById('modal-store-hours').value,
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
                    refreshDashboard();
                    modal.style.display = 'none';
                    // clear modal
                    document.getElementById('modal-store-name').value = '';
                    document.getElementById('modal-store-brand').value = '';
                    document.getElementById('modal-store-address').value = '';
                    document.getElementById('modal-store-category').value = '';
                    document.getElementById('modal-store-concept').value = '';
                    document.getElementById('modal-store-hours').value = '';
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
            if(currentStore) {
                await supabaseService.saveAnalysisResult({
                    store_id: currentStore.id,
                    claude_result: results[0],
                    chatgpt_result: results[1],
                    gemini_result: results[2],
                    created_at: new Date().toISOString()
                });
            }
            
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

