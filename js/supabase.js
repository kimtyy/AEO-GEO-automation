// js/supabase.js - Supabase 연동 및 데이터베이스 작업

// Supabase 클라이언트 초기화 (CDN 방식)
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const supabaseService = {
    /**
     * 매장 정보 가져오기
     * @param {string} storeId 
     */
    async getStore(storeId) {
        try {
            const { data, error } = await supabaseClient
                .from('stores')
                .select('*')
                .eq('id', storeId)
                .single();
            if (error) throw error;
            return data;
        } catch (error) {
            console.error('Error fetching store:', error);
            return null;
        }
    },

    /**
     * 모든 매장 목록 가져오기
     */
    async getAllStores() {
        try {
            const { data, error } = await supabaseClient
                .from('stores')
                .select('*')
                .order('created_at', { ascending: false });
            if (error) throw error;
            return data;
        } catch (error) {
            console.error('Error fetching all stores:', error);
            return [];
        }
    },

    /**
     * 새 매장 추가 (INSERT)
     * @param {Object} data 
     */
    async createStore(data) {
        try {
            const { data: result, error } = await supabaseClient
                .from('stores')
                .insert([data])
                .select()
                .single();
            if (error) throw error;
            console.log('Store created successfully:', result);
            return result;
        } catch (error) {
            console.error('Error creating store:', error);
            return null;
        }
    },

    /**
     * 매장 정보 수정 (UPDATE)
     * @param {string} storeId 
     * @param {Object} data 
     */
    async updateStore(storeId, data) {
        try {
            const { data: result, error } = await supabaseClient
                .from('stores')
                .update(data)
                .eq('id', storeId)
                .select()
                .single();
            if (error) throw error;
            console.log('Store updated successfully:', result);
            return result;
        } catch (error) {
            console.error('Error updating store:', error);
            return null;
        }
    },

    /**
     * 분석 결과 저장
     * @param {Object} data 
     */
    async saveAnalysisResult(data) {
        try {
            const insertData = Array.isArray(data) ? data : [data];
            const { data: result, error } = await supabaseClient
                .from('analysis_results')
                .insert(insertData)
                .select();
            if (error) throw error;
            console.log('Analysis result saved successfully:', result);
            return result;
        } catch (error) {
            console.error('Error saving analysis result:', error);
            return null;
        }
    },

    /**
     * 분석 이력 가져오기
     * @param {string} storeId 
     * @param {string} mode - 'monitoring' 또는 'content' (선택)
     */
    async getAnalysisHistory(storeId, mode = null) {
        try {
            let query = supabaseClient
                .from('analysis_results')
                .select('*')
                .eq('store_id', storeId);
            
            if (mode) {
                query = query.eq('mode', mode);
            }
            
            const { data, error } = await query.order('created_at', { ascending: false });
            if (error) throw error;
            return data;
        } catch (error) {
            console.error('Error fetching analysis history:', error);
            return [];
        }
    },

    /**
     * 콘텐츠 저장
     * @param {Object} data 
     */
    async saveContent(data) {
        try {
            const { data: result, error } = await supabaseClient
                .from('contents')
                .insert([data])
                .select();
            if (error) throw error;
            console.log('Content saved successfully:', result);
            return result;
        } catch (error) {
            console.error('Error saving content:', error);
            return null;
        }
    },

    /**
     * 콘텐츠 목록 가져오기
     * @param {string} storeId 
     */
    async getContents(storeId) {
        try {
            const { data, error } = await supabaseClient
                .from('contents')
                .select('*')
                .eq('store_id', storeId)
                .order('created_at', { ascending: false });
            if (error) throw error;
            return data;
        } catch (error) {
            console.error('Error fetching contents:', error);
            return [];
        }
    },

    /**
     * 경쟁사 목록 가져오기
     */
    async getCompetitors(storeId) {
        try {
            const { data, error } = await supabaseClient
                .from('competitors')
                .select('*')
                .eq('store_id', storeId)
                .order('created_at', { ascending: true });
            if (error) throw error;
            return data;
        } catch (error) {
            console.error('Error fetching competitors:', error);
            return [];
        }
    },

    /**
     * 경쟁사 추가
     */
    async addCompetitor(storeId, name, address) {
        try {
            const { data: result, error } = await supabaseClient
                .from('competitors')
                .insert([{ store_id: storeId, competitor_name: name, address: address }])
                .select();
            if (error) throw error;
            return result;
        } catch (error) {
            console.error('Error adding competitor:', error);
            return null;
        }
    },

    /**
     * 경쟁사 삭제
     */
    async deleteCompetitor(competitorId) {
        try {
            const { error } = await supabaseClient
                .from('competitors')
                .delete()
                .eq('id', competitorId);
            if (error) throw error;
            return true;
        } catch (error) {
            console.error('Error deleting competitor:', error);
            return false;
        }
    },

    // ── Phase 2: 모니터링 신뢰구간 ──────────────────────────────

    /**
     * monitoring_results 배치 INSERT
     * @param {Array} rows - [{ store_id, question, ai_type, mentioned, run_index, week }]
     */
    async saveMonitoringResult(rows) {
        try {
            const { data, error } = await supabaseClient
                .from('monitoring_results')
                .insert(rows)
                .select();
            if (error) throw error;
            return data;
        } catch (error) {
            console.error('Error saving monitoring results:', error);
            return null;
        }
    },

    /**
     * monitoring_summaries UPSERT (store_id+week+ai_type 기준 중복 시 덮어쓰기)
     * @param {Array} rows - [{ store_id, week, ai_type, mention_rate, ci_lower, ci_upper, n }]
     */
    async upsertMonitoringSummary(rows) {
        try {
            const { data, error } = await supabaseClient
                .from('monitoring_summaries')
                .upsert(rows, { onConflict: 'store_id,week,ai_type' })
                .select();
            if (error) throw error;
            return data;
        } catch (error) {
            console.error('Error upserting monitoring summaries:', error);
            return null;
        }
    },

    /**
     * monitoring_summaries 조회 (최근 N주)
     * @param {string} storeId
     * @param {number} weeks - 조회 주차 수 (기본 8주)
     */
    async getMonitoringSummary(storeId, weeks = 8) {
        try {
            const { data, error } = await supabaseClient
                .from('monitoring_summaries')
                .select('*')
                .eq('store_id', storeId)
                .order('week', { ascending: false })
                .limit(weeks * 3);   // AI 3개 × 주차
            if (error) throw error;
            return data || [];
        } catch (error) {
            console.error('Error fetching monitoring summaries:', error);
            return [];
        }
    },

    // ── Phase 4: 채널 배포 (오토파일럿) ──────────────────────────

    /**
     * 배포 대기 아이템 저장
     * @param {Object} data - { store_id, content_id, channel, status, created_at }
     */
    async saveDistributionItem(data) {
        try {
            const { data: result, error } = await supabaseClient
                .from('distribution_queue')
                .insert([data])
                .select();
            if (error) throw error;
            console.log('Distribution item saved successfully:', result);
            return result;
        } catch (error) {
            console.error('Error saving distribution item:', error);
            return null;
        }
    },

    /**
     * 특정 매장의 배포 대기 큐 및 이력 조회 (contents 테이블 조인)
     * @param {string} storeId
     */
    async getDistributionQueue(storeId) {
        try {
            const { data, error } = await supabaseClient
                .from('distribution_queue')
                .select(`
                    id,
                    store_id,
                    content_id,
                    channel,
                    status,
                    created_at,
                    published_at,
                    contents (
                        title,
                        body,
                        niche_keyword,
                        evidence_units
                    )
                `)
                .eq('store_id', storeId)
                .order('created_at', { ascending: false });
            if (error) throw error;
            return data || [];
        } catch (error) {
            console.error('Error fetching distribution queue:', error);
            return [];
        }
    },

    /**
     * 배포 아이템 상태 변경 (발행 완료 시 published_at 동시 갱신)
     * @param {string} id
     * @param {string} status
     */
    async updateDistributionStatus(id, status) {
        try {
            const updateData = { status };
            if (status === '발행완료') {
                updateData.published_at = new Date().toISOString();
            }
            const { data: result, error } = await supabaseClient
                .from('distribution_queue')
                .update(updateData)
                .eq('id', id)
                .select();
            if (error) throw error;
            console.log('Distribution status updated successfully:', result);
            return result;
        } catch (error) {
            console.error('Error updating distribution status:', error);
            return null;
        }
    }
};

